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

export namespace EnableOptinRegionTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
  }
}

export class EnableOptinRegionTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: Construct, id: string, props: EnableOptinRegionTask.Props) {
    super(scope, id);

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

    const createTaskResultPath = '$.enableOutput';
    const createTaskResultLength = `${createTaskResultPath}.outputCount`;


    const enableTask = new CodeTask(scope, `Start Optin Region`, {
      resultPath: createTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.enableOptinRegions.enable',
      },
    });

    // Create Map task to iterate
    const mapTask = new sfn.Map(this, `Enable Optin Region Map`, {
      itemsPath: '$.accounts',
      resultPath: sfn.JsonPath.DISCARD,
      maxConcurrency: 15,
      parameters: {
        'accountId.$': '$$.Map.Item.Value',
        'assumeRoleName.$': '$.assumeRoleName',
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
        'baseline.$': '$.baseline'
      },
    });
    mapTask.iterator(enableTask);

    const verifyTaskResultPath = '$.verifyOutput';
    const verifyTask = new CodeTask(scope, 'Verify Optin Region', {
      resultPath: verifyTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.enableOptinRegions.verify',
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait for Optin Region Enabling', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'Optin Region Enablement Succeeded');

    const fail = new sfn.Fail(this, 'Optin Region Enablement Failed');

    waitTask
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'Optin Region Enablement Done?')
          .when(sfn.Condition.stringEquals(verifyTaskResultPath, 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskResultPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    enableTask.next(
      new sfn.Choice(scope, 'Optin Region Enablement Started?')
        .when(sfn.Condition.numberLessThanEquals(createTaskResultLength, 0), pass) //already enabled or skipped
        .when(sfn.Condition.numberGreaterThan(createTaskResultLength, 0), waitTask) //processing
        .otherwise(fail)
        .afterwards(),
    );

    this.startState = mapTask.startState;
    this.endStates = fail.endStates;
  }
}
