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

import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export namespace StoreOutputsToSSMTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    acceleratorPrefix: string;
    functionPayload?: { [key: string]: unknown };
    waitSeconds?: number;
  }
}

export class StoreOutputsToSSMTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: Construct, id: string, props: StoreOutputsToSSMTask.Props) {
    super(scope, id);

    const { role, lambdaCode, functionPayload, acceleratorPrefix } = props;

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );

    const fetchConfigData = new CodeTask(scope, `Load All Config`, {
      comment: 'Load All Config',
      resultPath: '$.configDetails',
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.loadAllConfig',
      },
    });

    const storeAccountOutputs = new sfn.Map(this, `Store Account Outputs To SSM`, {
      itemsPath: `$.accounts`,
      resultPath: sfn.JsonPath.DISCARD,
      maxConcurrency: 10,
      parameters: {
        'accountId.$': '$$.Map.Item.Value',
        'regions.$': '$.regions',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
        'assumeRoleName.$': '$.assumeRoleName',
        'outputsTableName.$': '$.outputsTableName',
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'outputUtilsTableName.$': '$.outputUtilsTableName',
        'accountsTableName.$': '$.accountsTableName',
        'configDetails.$': '$.configDetails',
      },
    });

    const getAccountInfoTask = new CodeTask(scope, `Get Account Details`, {
      comment: 'Get Account Info',
      resultPath: '$.account',
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.getAccountInfo',
      },
    });

    fetchConfigData.next(storeAccountOutputs);

    const storeOutputsToSSMTaskRegionMapperTask = new tasks.StepFunctionsStartExecution(
      this,
      'Store Outputs to SSM Region Mapper',
      {
        stateMachine: this.createStoreOututsSSMRegionMapperSM(
          lambdaCode,
          role,
          functionPayload,
          scope,
          acceleratorPrefix,
        ),
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          'account.$': '$.account',
          'regions.$': '$.regions',
          'acceleratorPrefix.$': '$.acceleratorPrefix',
          'assumeRoleName.$': '$.assumeRoleName',
          'outputsTableName.$': '$.outputsTableName',
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          'outputUtilsTableName.$': '$.outputUtilsTableName',
          'accountsTableName.$': '$.accountsTableName',
          'configDetails.$': '$.configDetails',
        }),
        resultPath: sfn.JsonPath.DISCARD,
      },
    );
    getAccountInfoTask.next(storeOutputsToSSMTaskRegionMapperTask);

    const pass = new sfn.Pass(this, 'Store Outputs To SSM Success');
    storeAccountOutputs.iterator(getAccountInfoTask);
    const chain = sfn.Chain.start(storeAccountOutputs).next(pass);

    this.startState = fetchConfigData.startState;
    this.endStates = chain.endStates;
  }

  private createStoreOututsSSMRegionMapperSM(
    lambdaCode: lambda.Code,
    role: iam.IRole,
    functionPayload: { [p: string]: unknown } | undefined,
    scope: Construct,
    acceleratorPrefix: string,
  ) {
    // Task that store the outputs
    const storeOutputsTask = new CodeTask(scope, `Store Outputs To SSM`, {
      resultPath: '$.storeOutputsOutput',
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.saveOutputsToSSM',
      },
    });

    // Mapped by region
    const storeAccountRegionOutputs = new sfn.Map(this, `Store Account Region Outputs To SSM`, {
      itemsPath: `$.regions`,
      resultPath: sfn.JsonPath.DISCARD,
      maxConcurrency: 10,
      parameters: {
        'account.$': '$.account',
        'region.$': '$$.Map.Item.Value',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
        'assumeRoleName.$': '$.assumeRoleName',
        'outputsTableName.$': '$.outputsTableName',
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'outputUtilsTableName.$': '$.outputUtilsTableName',
        'accountsTableName.$': '$.accountsTableName',
        'configDetails.$': '$.configDetails',
      },
    });
    storeAccountRegionOutputs.iterator(storeOutputsTask);

    // In its own state machine
    return new sfn.StateMachine(this, `${acceleratorPrefix}StoreOutputsToSSMRegionMapper_sm`, {
      stateMachineName: `${acceleratorPrefix}StoreOutputsToSSMRegionMapper_sm`,
      definition: sfn.Chain.start(storeAccountRegionOutputs),
    });
  }
}
