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
import { Construct } from 'constructs';

import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';

export namespace AddTagsToResourcesTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
    name: string;
    permissions?: string[];
    functionPayload?: { [key: string]: string };
  }
}

export class AddTagsToResourcesTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: Construct, id: string, props: AddTagsToResourcesTask.Props) {
    super(scope, id);

    const { role, lambdaCode, name, permissions, waitSeconds = 60 } = props;

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

    const ddbTask = new CodeTask(scope, `${name} DDB Task`, {
      resultPath: '$',
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.addTagsToSharedResources.scan',
      },
      functionPayload: {
        'assumeRoleName.$': '$.assumeRoleName',
        'outputTableName.$': '$.outputTableName',
        's3Bucket.$': '$.s3Bucket',
        'accounts.$': '$.accounts',
        ...props.functionPayload,
      },
    });

    // Create Map task to iterate
    const mapTask = new sfn.Map(this, `${name} Map`, {
      itemsPath: '$.accounts',
      // resultPath: '$.errors',
      resultPath: '$.results',
      maxConcurrency: 10,
      parameters: {
        'accountId.$': '$$.Map.Item.Value',
        'assumeRoleName.$': '$.assumeRoleName',
        'outputTableName.$': '$.outputTableName',
        's3Bucket.$': '$.s3Bucket',
        's3Key.$': '$.s3Key',
        ...props.functionPayload,
      },
    });

    const addTagTask = new CodeTask(scope, `${name} Add Tag Task`, {
      resultPath: '$',
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.addTagsToSharedResources.add',
      },
      functionPayload: {
        'accountId.$': '$.accountId',
        'assumeRoleName.$': '$.assumeRoleName',
        'outputTableName.$': '$.outputTableName',
        's3Bucket.$': '$.s3Bucket',
        's3Key.$': '$.s3Key',
        ...props.functionPayload,
      },
    });

    mapTask.iterator(addTagTask);

    const verifyddbTask = new CodeTask(scope, `${name} Verify DDB Task`, {
      resultPath: '$',
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.addTagsToSharedResources.verify',
      },
      inputPath: '$',
    });

    const pass = new sfn.Pass(this, `${name} Verify DDB Success`, {
      resultPath: sfn.JsonPath.DISCARD,
    });

    const fail = new sfn.Fail(this, `${name} Verify DDB Failed`);

    const isDdbTaskSuccess = new sfn.Choice(scope, `${name} Verify DDB Success?`)
      .when(sfn.Condition.stringEquals('$.status', 'SUCCESS'), pass)
      .otherwise(fail);

    const chain = sfn.Chain.start(ddbTask).next(mapTask).next(verifyddbTask).next(isDdbTaskSuccess);
    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
