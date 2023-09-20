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

export namespace CreateStackTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
    functionPayload?: { [key: string]: unknown };
    suffix?: string;
  }
}

export class CreateStackTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: Construct, id: string, props: CreateStackTask.Props) {
    super(scope, id);

    const { role, lambdaCode, functionPayload, suffix, waitSeconds = 10 } = props;

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

    const deployTask = new CodeTask(scope, `Deploy ${suffix || 'Stack'}`, {
      resultPath: sfn.JsonPath.DISCARD,
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStack.create',
      },
    });

    const verifyTaskResultPath = '$.verify';
    const verifyTaskStatusPath = `${verifyTaskResultPath}.status`;
    const verifyTask = new CodeTask(scope, `Verify${suffix || ''}`, {
      resultPath: verifyTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStack.verify',
      },
    });

    const waitTask = new sfn.Wait(scope, `Wait${suffix || ''}`, {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, `Succeeded${suffix || ''}`);

    const fail = new sfn.Fail(this, `Failed${suffix || ''}`);

    const chain = sfn.Chain.start(deployTask)
      .next(waitTask)
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, `Choice${suffix || ''}`)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
