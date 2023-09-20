/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';
import { CreateStackTask } from './create-stack-task';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export namespace CDKBootstrapTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    acceleratorPrefix: string;
    s3BucketName: string;
    operationsBootstrapObjectKey: string;
    accountBootstrapObjectKey: string;
    assumeRoleName: string;
    bootStrapStackName: string;
    functionPayload?: { [key: string]: unknown };
    waitSeconds?: number;
  }
}

export class CDKBootstrapTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: Construct, id: string, props: CDKBootstrapTask.Props) {
    super(scope, id);

    const {
      role,
      lambdaCode,
      acceleratorPrefix,
      assumeRoleName,
      operationsBootstrapObjectKey,
      s3BucketName,
      bootStrapStackName,
      accountBootstrapObjectKey,
    } = props;

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );

    const getAccountInfoTask = new CodeTask(scope, `Get Operations Account Info`, {
      resultPath: '$.operationsAccount',
      functionPayload: {
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'accountsTableName.$': '$.accountsTableName',
        accountType: 'central-operations',
      },
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.getAccountInfo',
      },
    });

    const createRootBootstrapInRegion = new sfn.Map(this, `Bootstrap Operations Account`, {
      itemsPath: `$.regions`,
      resultPath: sfn.JsonPath.DISCARD,
      maxConcurrency: 20,
      parameters: {
        'accountId.$': '$.operationsAccount.id',
        'organizationId.$': '$.operationsAccount.ou',
        'region.$': '$$.Map.Item.Value',
        qualifier: acceleratorPrefix.endsWith('-')
          ? acceleratorPrefix.slice(0, -1).toLowerCase()
          : acceleratorPrefix.toLowerCase(),
        assumeRoleName,
      },
    });

    const bootstrapMasterStateMachine = new sfn.StateMachine(
      this,
      `${acceleratorPrefix}BootstrapOperationsAccount_sm`,
      {
        stateMachineName: `${props.acceleratorPrefix}BootstrapOperationsAccount_sm`,
        definition: new CreateStackTask(this, 'Bootstrap Operations Acccount Task', {
          lambdaCode,
          role,
          suffix: 'Operations',
        }),
      },
    );

    const bootstrapOpsTask = new tasks.StepFunctionsStartExecution(this, 'Bootstrap Operations Acccount', {
      stateMachine: bootstrapMasterStateMachine,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      input: sfn.TaskInput.fromObject({
        stackName: bootStrapStackName,
        stackCapabilities: ['CAPABILITY_NAMED_IAM'],
        stackParameters: {
          'OrganizationId.$': '$.organizationId',
          'Qualifier.$': '$.qualifier',
          AcceleratorPrefix: acceleratorPrefix,
        },
        stackTemplate: {
          s3BucketName,
          s3ObjectKey: operationsBootstrapObjectKey,
        },
        'accountId.$': '$.accountId',
        assumeRoleName,
        'region.$': '$.region',
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });
    createRootBootstrapInRegion.iterator(bootstrapOpsTask);

    const getBootstrapOutput = new CodeTask(scope, `Get Bootstrap output`, {
      resultPath: '$.accounts',
      functionPayload: {
        'accounts.$': '$.accounts',
        'operationsAccountId.$': '$.operationsAccount.id',
      },
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.getBootstrapOutput',
      },
    });

    const createBootstrapInAccount = new sfn.Map(this, `Bootstrap Account Map`, {
      itemsPath: `$.accounts`,
      resultPath: sfn.JsonPath.DISCARD,
      maxConcurrency: 10,
      parameters: {
        'accountId.$': '$$.Map.Item.Value',
        'regions.$': '$.regions',
        acceleratorPrefix: acceleratorPrefix.endsWith('-')
          ? acceleratorPrefix.slice(0, -1).toLowerCase()
          : acceleratorPrefix.toLowerCase(),
      },
    });

    const bootstrapAccountRegionMapperTask = new tasks.StepFunctionsStartExecution(
      this,
      'Bootstrap Account Region Mapper',
      {
        stateMachine: this.createBootstrapAccountRegionMapperSM(
          lambdaCode,
          role,
          bootStrapStackName,
          s3BucketName,
          accountBootstrapObjectKey,
          assumeRoleName,
          acceleratorPrefix,
        ),
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          stackName: bootStrapStackName,
          'accountId.$': '$.accountId',
          'regions.$': '$.regions',
          'acceleratorPrefix.$': '$.acceleratorPrefix',
        }),
        resultPath: sfn.JsonPath.DISCARD,
      },
    );
    createBootstrapInAccount.iterator(bootstrapAccountRegionMapperTask);

    const chain = sfn.Chain.start(getAccountInfoTask)
      .next(createRootBootstrapInRegion)
      .next(getBootstrapOutput)
      .next(createBootstrapInAccount);

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }

  private createBootstrapAccountRegionMapperSM(
    lambdaCode: lambda.Code,
    role: iam.IRole,
    bootStrapStackName: string,
    s3BucketName: string,
    accountBootstrapObjectKey: string,
    assumeRoleName: string,
    acceleratorPrefix: string,
  ) {
    // Tasks that creates the account
    const bootstrapStateMachine = new sfn.StateMachine(this, `${acceleratorPrefix}BootstrapAccount_sm`, {
      stateMachineName: `${acceleratorPrefix}BootstrapAccount_sm`,
      definition: new CreateStackTask(this, 'Bootstrap Acccount Task', {
        lambdaCode,
        role,
        suffix: 'Account Bootstrap Stack',
      }),
    });

    // State machine that creates the account using the task
    const bootstrapTask = new tasks.StepFunctionsStartExecution(this, 'Bootstrap Acccount', {
      stateMachine: bootstrapStateMachine,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      input: sfn.TaskInput.fromObject({
        stackName: bootStrapStackName,
        stackParameters: {
          'Qualifier.$': '$.acceleratorPrefix',
        },
        stackTemplate: {
          s3BucketName,
          s3ObjectKey: accountBootstrapObjectKey,
        },
        'accountId.$': '$.accountId',
        'region.$': '$.region',
        ignoreAccountId: cdk.Aws.ACCOUNT_ID,
        ignoreRegion: cdk.Aws.REGION,
        assumeRoleName,
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });

    // Mapped by region
    const createBootstrapInRegion = new sfn.Map(this, `Bootstrap Account Region Map`, {
      itemsPath: `$.regions`,
      resultPath: sfn.JsonPath.DISCARD,
      maxConcurrency: 17,
      parameters: {
        'accountId.$': '$.accountId',
        'region.$': '$$.Map.Item.Value',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
      },
    });
    createBootstrapInRegion.iterator(bootstrapTask);

    // In its own state machine
    return new sfn.StateMachine(this, `${acceleratorPrefix}BootstrapAccountRegionMapper_sm`, {
      stateMachineName: `${acceleratorPrefix}BootstrapAccountRegionMapper_sm`,
      definition: sfn.Chain.start(createBootstrapInRegion),
    });
  }
}
