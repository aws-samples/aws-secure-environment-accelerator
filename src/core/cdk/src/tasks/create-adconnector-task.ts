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

import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';

export namespace CreateAdConnectorTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
  }
}

export class CreateAdConnectorTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateAdConnectorTask.Props) {
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

    const createTaskResultPath = '$.createOutput';
    const createTaskResultLength = `${createTaskResultPath}.outputCount`;
    const createTask = new CodeTask(scope, `Start AD Connector Creation`, {
      resultPath: createTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createAdConnector.create',
      },
    });

    const verifyTaskResultPath = '$.verifyOutput';
    const verifyTask = new CodeTask(scope, 'Verify AdConnector Creation', {
      resultPath: verifyTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createAdConnector.verify',
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait for AdConnector Creation', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'AdConnector Creation Succeeded');

    const fail = new sfn.Fail(this, 'AdConnector Creation Failed');

    waitTask
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'AdConnector Creation Done?')
          .when(sfn.Condition.stringEquals(verifyTaskResultPath, 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskResultPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    createTask.next(
      new sfn.Choice(scope, 'AdConnection Creation Started?')
        .when(sfn.Condition.numberEquals(createTaskResultLength, 0), pass)
        .when(sfn.Condition.numberGreaterThan(createTaskResultLength, 0), waitTask)
        .otherwise(fail)
        .afterwards(),
    );

    this.startState = createTask.startState;
    this.endStates = fail.endStates;
  }
}
