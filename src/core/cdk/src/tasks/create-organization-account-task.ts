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
import { Construct } from 'constructs';

export namespace CreateOrganizationAccountTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
  }
}

export class CreateOrganizationAccountTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: Construct, id: string, props: CreateOrganizationAccountTask.Props) {
    super(scope, id);

    console.log('In CreateOrganizationAccountTask');
    const { role, lambdaCode, waitSeconds = 60 } = props;

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['codepipeline:PutJobSuccessResult', 'codepipeline:PutJobFailureResult'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['organizations:CreateAccount', 'organizations:DescribeCreateAccountStatus'],
      }),
    );

    const createTaskResultPath = '$.createOutput';
    const createTaskStatusPath = `${createTaskResultPath}.status`;
    console.log(`organization createTaskStatusPath ${createTaskStatusPath}`);
    const createTask = new CodeTask(scope, `Start Account Creation`, {
      resultPath: createTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createOrganizationAccount.create',
      },
      functionPayload: {
        'account.$': '$.createAccountConfiguration.account',
        'configRepositoryName.$': '$.createAccountConfiguration.configRepositoryName',
        'configFilePath.$': '$.createAccountConfiguration.configFilePath',
        'configCommitId.$': '$.createAccountConfiguration.configCommitId',
      },
    });

    const verifyTaskResultPath = '$.verifyOutput';
    const verifyTaskStatusPath = `${verifyTaskResultPath}.status`;
    const verifyTask = new CodeTask(scope, 'Verify Account Creation', {
      resultPath: verifyTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createOrganizationAccount.verify',
      },
      functionPayload: {
        'account.$': '$.createAccountConfiguration.account',
        'requestId.$': '$.createOutput.provisionToken',
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait for Org Account Creation', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'Account Creation Succeeded');

    const fail = new sfn.Fail(this, 'Account Creation Failed');

    const attachQuarantineScpTask = new CodeTask(scope, 'Attach Quarantine SCP To Account', {
      resultPath: sfn.JsonPath.DISCARD,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createOrganizationAccount.addScp',
      },
      functionPayload: {
        'account.$': '$.moveOutput',
        'acceleratorPrefix.$': '$.createAccountConfiguration.acceleratorPrefix',
        'acceleratorName.$': '$.createAccountConfiguration.acceleratorName',
        region: cdk.Aws.REGION,
        'organizationAdminRole.$': '$.createAccountConfiguration.organizationAdminRole',
      },
    });
    attachQuarantineScpTask.next(pass);

    const moveTaskResultPath = '$.moveOutput';
    const moveTask = new CodeTask(scope, 'Move Account to Organizational Unit', {
      resultPath: moveTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createOrganizationAccount.move',
      },
      functionPayload: {
        'account.$': '$.verifyOutput.account',
        'organizationalUnits.$': '$.createAccountConfiguration.organizationalUnits',
      },
    });
    moveTask.next(attachQuarantineScpTask);

    waitTask
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'Account Creation Done?')
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'SUCCEEDED'), moveTask)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'ALREADY_EXISTS'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'NON_MANDATORY_ACCOUNT_FAILURE'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    createTask.next(
      new sfn.Choice(scope, 'Account Creation Started?')
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'SUCCEEDED'), waitTask)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'NON_MANDATORY_ACCOUNT_FAILURE'), pass)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'ALREADY_EXISTS'), pass)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'IN_PROGRESS'), waitTask)
        .otherwise(fail)
        .afterwards(),
    );

    this.startState = createTask.startState;
    this.endStates = fail.endStates;
  }
}
