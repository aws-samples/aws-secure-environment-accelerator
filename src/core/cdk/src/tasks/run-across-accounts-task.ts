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
import { Construct } from 'constructs';

export namespace RunAcrossAccountsTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
    lambdaPath: string;
    name: string;
    permissions?: string[];
    baselineCheck?: boolean;
    functionPayload?: { [key: string]: string };
  }
}

export class RunAcrossAccountsTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: Construct, id: string, props: RunAcrossAccountsTask.Props) {
    super(scope, id);

    const { role, lambdaCode, name, lambdaPath, permissions, baselineCheck, waitSeconds = 60 } = props;

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );
    if (permissions && permissions.length > 0) {
      role.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          resources: ['*'],
          actions: permissions,
        }),
      );
    }

    const runTask = new CodeTask(scope, name, {
      resultPath: '$',
      functionProps: {
        role,
        code: lambdaCode,
        handler: `${lambdaPath}.run`,
      },
      functionPayload: {
        'accountId.$': '$.accountId',
        'assumeRoleName.$': '$.assumeRoleName',
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
        'baseline.$': '$.baseline',
        ...props.functionPayload,
      },
    });

    // Create Map task to iterate
    const mapTask = new sfn.Map(this, `${name} Map`, {
      itemsPath: '$.accounts',
      resultPath: '$.errors',
      maxConcurrency: 50,
      parameters: {
        'accountId.$': '$$.Map.Item.Value',
        'assumeRoleName.$': '$.assumeRoleName',
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
        'baseline.$': '$.baseline',
        ...props.functionPayload,
      },
    });
    mapTask.iterator(runTask);

    const verifyTask = new CodeTask(scope, `${name} Verify`, {
      resultPath: '$',
      functionProps: {
        role,
        code: lambdaCode,
        handler: `${lambdaPath}.verify`,
      },
      inputPath: '$',
    });

    const pass = new sfn.Pass(this, `${name} Success`, {
      resultPath: sfn.JsonPath.DISCARD,
    });

    const fail = new sfn.Fail(this, `${name} Failed`);

    const isTaskSuccess = new sfn.Choice(scope, `${name} Deleted?`)
      .when(sfn.Condition.stringEquals('$.status', 'SUCCESS'), pass)
      .otherwise(fail);

    let chain: sfn.Chain;
    if (baselineCheck) {
      mapTask.next(verifyTask).next(isTaskSuccess);
      // Add more conditions if required.
      const baselineChoice = new sfn.Choice(scope, `${name}Baseline?`, {
        comment: 'Baseline?',
      })
        .when(sfn.Condition.stringEquals(`$.baseline`, 'ORGANIZATIONS'), mapTask)
        .otherwise(pass);
      chain = sfn.Chain.start(baselineChoice);
    } else {
      chain = sfn.Chain.start(mapTask).next(verifyTask).next(isTaskSuccess);
    }

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
