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

export namespace CreateStackSetTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    functionPayload?: { [key: string]: unknown };
    waitSeconds?: number;
  }
}

export class CreateStackSetTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateStackSetTask.Props) {
    super(scope, id);

    const { role, lambdaCode, functionPayload, waitSeconds = 10 } = props;

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

    const createTaskResultPath = '$.createStackSetOutput';
    const createTaskStatusPath = `${createTaskResultPath}.status`;
    const createTask = new CodeTask(scope, `Start Stack Set Creation`, {
      resultPath: createTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.createStackSet',
      },
    });

    const verifyTaskResultPath = '$.verifyStackOutput';
    const verifyTaskStatusPath = `${verifyTaskResultPath}.status`;
    const verifyTask = new CodeTask(scope, 'Verify Stack Set Creation', {
      resultPath: verifyTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.verify',
      },
    });

    const createInstancesTaskResultPath = '$.createInstancesOutput';
    const createInstancesTaskStatusPath = `${createInstancesTaskResultPath}.status`;
    const createInstancesTask = new CodeTask(scope, `Start Stack Set Instance Creation`, {
      resultPath: createInstancesTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.createStackSetInstances',
      },
    });

    const verifyCreateInstancesTaskResultPath = '$.verifyCreateInstancesOutput';
    const verifyCreateInstancesTaskStatusPath = `${verifyCreateInstancesTaskResultPath}.status`;
    const verifyCreateInstancesTask = new CodeTask(scope, 'Verify Stack Set Instances Creation', {
      resultPath: verifyCreateInstancesTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.verify',
      },
    });

    const updateInstancesTaskResultPath = '$.updateInstancesOutput';
    const updateInstancesTaskStatusPath = `${updateInstancesTaskResultPath}.status`;
    const updateInstancesTask = new CodeTask(scope, `Start Stack Set Instance Update`, {
      resultPath: updateInstancesTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.updateStackSetInstances',
      },
    });

    const verifyUpdateInstancesTaskResultPath = '$.verifyUpdateInstancesOutput';
    const verifyUpdateInstancesTaskStatusPath = `${verifyUpdateInstancesTaskResultPath}.status`;
    const verifyUpdateInstancesTask = new CodeTask(scope, 'Verify Stack Set Instances Update', {
      resultPath: verifyUpdateInstancesTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.verify',
      },
    });

    const deleteInstancesTaskResultPath = '$.deleteInstancesOutput';
    const deleteInstancesTaskStatusPath = `${deleteInstancesTaskResultPath}.status`;
    const deleteInstancesTask = new CodeTask(scope, `Start Stack Set Instance Deletion`, {
      resultPath: deleteInstancesTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.deleteStackSetInstances',
      },
    });

    const verifyDeleteInstancesTaskResultPath = '$.verifyUpdateInstancesOutput';
    const verifyDeleteInstancesTaskStatusPath = `${verifyDeleteInstancesTaskResultPath}.status`;
    const verifyDeleteInstancesTask = new CodeTask(scope, 'Verify Stack Set Instances Deletion', {
      resultPath: verifyDeleteInstancesTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.verify',
      },
    });

    const deleteInOperableInstancesTask = new CodeTask(scope, `Start Stack Set InOperable Instance Deletion`, {
      resultPath: deleteInstancesTaskResultPath,
      functionPayload: {
        'stackName.$': '$.stackName',
        'instanceAccounts.$': '$.instanceAccounts',
        'instanceRegions.$': '$.instanceRegions',
        retainStacks: true,
      },
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.deleteStackSetInstances',
      },
    });

    const verifyDeleteInOperableInstancesTask = new CodeTask(scope, 'Verify Stack Set InOperable Instances Deletion', {
      resultPath: verifyDeleteInstancesTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStackSet.verify',
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait For Stack Set Creation', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const waitCreateInstancesTask = new sfn.Wait(scope, 'Wait for Stack Set Instances Creation', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const waitUpdateInstancesTask = new sfn.Wait(scope, 'Wait for Stack Set Instances Update', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const waitDeleteInstancesTask = new sfn.Wait(scope, 'Wait for Stack Set Instances Deletion', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const waitDeleteInOperableInstancesTask = new sfn.Wait(scope, 'Wait for Stack Set InOperable Instances Deletion', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'Stack Set Creation Succeeded');

    const fail = new sfn.Fail(this, 'Stack Set Creation Failed');

    createInstancesTask.next(
      new sfn.Choice(scope, 'Stack Set Instances Created?')
        .when(sfn.Condition.stringEquals(createInstancesTaskStatusPath, 'UP_TO_DATE'), updateInstancesTask)
        .when(sfn.Condition.stringEquals(createInstancesTaskStatusPath, 'SUCCESS'), waitCreateInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    waitCreateInstancesTask
      .next(verifyCreateInstancesTask)
      .next(
        new sfn.Choice(scope, 'Stack Set Instances Creation Done?')
          .when(sfn.Condition.stringEquals(verifyCreateInstancesTaskStatusPath, 'SUCCESS'), updateInstancesTask)
          .when(sfn.Condition.stringEquals(verifyCreateInstancesTaskStatusPath, 'IN_PROGRESS'), waitCreateInstancesTask)
          .otherwise(fail)
          .afterwards(),
      );

    updateInstancesTask.next(
      new sfn.Choice(scope, 'Stack Set Instances Updated?')
        .when(sfn.Condition.stringEquals(updateInstancesTaskStatusPath, 'UP_TO_DATE'), deleteInstancesTask)
        .when(sfn.Condition.stringEquals(updateInstancesTaskStatusPath, 'IN_OPERABLE'), deleteInstancesTask)
        .when(sfn.Condition.stringEquals(updateInstancesTaskStatusPath, 'SUCCESS'), waitUpdateInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    waitUpdateInstancesTask
      .next(verifyUpdateInstancesTask)
      .next(
        new sfn.Choice(scope, 'Stack Set Instances Update Done?')
          .when(sfn.Condition.stringEquals(verifyUpdateInstancesTaskStatusPath, 'SUCCESS'), deleteInstancesTask)
          .when(sfn.Condition.stringEquals(verifyUpdateInstancesTaskStatusPath, 'IN_OPERABLE'), deleteInstancesTask)
          .when(sfn.Condition.stringEquals(verifyUpdateInstancesTaskStatusPath, 'IN_PROGRESS'), waitUpdateInstancesTask)
          .otherwise(fail)
          .afterwards(),
      );

    deleteInstancesTask.next(
      new sfn.Choice(scope, 'Stack Set Instances Deleted?')
        .when(sfn.Condition.stringEquals(deleteInstancesTaskStatusPath, 'UP_TO_DATE'), pass)
        .when(sfn.Condition.stringEquals(deleteInstancesTaskStatusPath, 'SUCCESS'), waitDeleteInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    deleteInOperableInstancesTask.next(
      new sfn.Choice(scope, 'Stack Set InOperable Instances Deleted?')
        .when(sfn.Condition.stringEquals(deleteInstancesTaskStatusPath, 'UP_TO_DATE'), pass)
        .when(sfn.Condition.stringEquals(deleteInstancesTaskStatusPath, 'SUCCESS'), waitDeleteInOperableInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    waitDeleteInstancesTask
      .next(verifyDeleteInstancesTask)
      .next(
        new sfn.Choice(scope, 'Stack Set Instances Deletion Done?')
          .when(sfn.Condition.stringEquals(verifyDeleteInstancesTaskStatusPath, 'SUCCESS'), pass)
          .when(
            sfn.Condition.stringEquals(verifyDeleteInstancesTaskStatusPath, 'IN_OPERABLE'),
            deleteInOperableInstancesTask,
          )
          .when(sfn.Condition.stringEquals(verifyDeleteInstancesTaskStatusPath, 'IN_PROGRESS'), waitDeleteInstancesTask)
          .otherwise(fail)
          .afterwards(),
      );

    waitDeleteInOperableInstancesTask
      .next(verifyDeleteInOperableInstancesTask)
      .next(
        new sfn.Choice(scope, 'Stack Set InOperable Instances Deletion Done?')
          .when(sfn.Condition.stringEquals(verifyDeleteInstancesTaskStatusPath, 'SUCCESS'), pass)
          .when(
            sfn.Condition.stringEquals(verifyDeleteInstancesTaskStatusPath, 'IN_PROGRESS'),
            waitDeleteInOperableInstancesTask,
          )
          .otherwise(fail)
          .afterwards(),
      );

    waitTask
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'Stack Set Creation Done?')
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'SUCCESS'), createInstancesTask)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    const chain = sfn.Chain.start(createTask).next(
      new sfn.Choice(scope, 'Stack Set Created?')
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'SUCCESS'), waitTask)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'UP_TO_DATE'), createInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
