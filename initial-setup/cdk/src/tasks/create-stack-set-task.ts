import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';

export namespace CreateStackSetTask {
  export interface Props {
    role: iam.IRole;
    lambdas: WebpackBuild;
    functionPayload?: { [key: string]: unknown };
    waitSeconds?: number;
  }
}

export class CreateStackSetTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateStackSetTask.Props) {
    super(scope, id);

    const { role, lambdas, functionPayload, waitSeconds = 10 } = props;

    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );
    role.addToPolicy(
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
        code: lambdas.codeForEntry('create-stack-set/create-stack-set'),
      },
    });

    const verifyTaskResultPath = '$.verifyStackOutput';
    const verifyTaskStatusPath = `${verifyTaskResultPath}.status`;
    const verifyTask = new CodeTask(scope, 'Verify Stack Set Creation', {
      resultPath: verifyTaskResultPath,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/verify'),
      },
    });

    const createInstancesTaskResultPath = '$.createInstancesOutput';
    const createInstancesTaskStatusPath = `${createInstancesTaskResultPath}.status`;
    const createInstancesTask = new CodeTask(scope, `Start Stack Set Instance Creation`, {
      resultPath: createInstancesTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/create-stack-set-instances'),
      },
    });

    const verifyCreateInstancesTaskResultPath = '$.verifyCreateInstancesOutput';
    const verifyCreateInstancesTaskStatusPath = `${verifyCreateInstancesTaskResultPath}.status`;
    const verifyCreateInstancesTask = new CodeTask(scope, 'Verify Stack Set Instances Creation', {
      resultPath: verifyCreateInstancesTaskResultPath,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/verify'),
      },
    });

    const updateInstancesTaskResultPath = '$.updateInstancesOutput';
    const updateInstancesTaskStatusPath = `${updateInstancesTaskResultPath}.status`;
    const updateInstancesTask = new CodeTask(scope, `Start Stack Set Instance Update`, {
      resultPath: updateInstancesTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/update-stack-set-instances'),
      },
    });

    const verifyUpdateInstancesTaskResultPath = '$.verifyUpdateInstancesOutput';
    const verifyUpdateInstancesTaskStatusPath = `${verifyUpdateInstancesTaskResultPath}.status`;
    const verifyUpdateInstancesTask = new CodeTask(scope, 'Verify Stack Set Instances Update', {
      resultPath: verifyUpdateInstancesTaskResultPath,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/verify'),
      },
    });

    const deleteInstancesTaskResultPath = '$.deleteInstancesOutput';
    const deleteInstancesTaskStatusPath = `${deleteInstancesTaskResultPath}.status`;
    const deleteInstancesTask = new CodeTask(scope, `Start Stack Set Instance Deletion`, {
      resultPath: deleteInstancesTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/delete-stack-set-instances'),
      },
    });

    const verifyDeleteInstancesTaskResultPath = '$.verifyUpdateInstancesOutput';
    const verifyDeleteInstancesTaskStatusPath = `${verifyDeleteInstancesTaskResultPath}.status`;
    const verifyDeleteInstancesTask = new CodeTask(scope, 'Verify Stack Set Instances Deletion', {
      resultPath: verifyDeleteInstancesTaskResultPath,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/verify'),
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

    const pass = new sfn.Pass(this, 'Stack Set Creation Succeeded');

    const fail = new sfn.Fail(this, 'Stack Set Creation Failed');

    createInstancesTask.next(
      new sfn.Choice(scope, 'Stack Set Instances Created?')
        .when(sfn.Condition.stringEquals(createInstancesTaskStatusPath, 'UP_TO_DATE'), updateInstancesTask)
        .when(sfn.Condition.stringEquals(createInstancesTaskStatusPath, 'SUCCESS'), waitCreateInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    waitCreateInstancesTask.next(verifyCreateInstancesTask).next(
      new sfn.Choice(scope, 'Stack Set Instances Creation Done?')
        .when(sfn.Condition.stringEquals(verifyCreateInstancesTaskStatusPath, 'SUCCESS'), updateInstancesTask)
        .when(sfn.Condition.stringEquals(verifyCreateInstancesTaskStatusPath, 'IN_PROGRESS'), waitCreateInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    updateInstancesTask.next(
      new sfn.Choice(scope, 'Stack Set Instances Updated?')
        .when(sfn.Condition.stringEquals(updateInstancesTaskStatusPath, 'UP_TO_DATE'), deleteInstancesTask)
        .when(sfn.Condition.stringEquals(updateInstancesTaskStatusPath, 'SUCCESS'), waitUpdateInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    waitUpdateInstancesTask.next(verifyUpdateInstancesTask).next(
      new sfn.Choice(scope, 'Stack Set Instances Update Done?')
        .when(sfn.Condition.stringEquals(verifyUpdateInstancesTaskStatusPath, 'SUCCESS'), deleteInstancesTask)
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

    waitDeleteInstancesTask.next(verifyDeleteInstancesTask).next(
      new sfn.Choice(scope, 'Stack Set Instances Deletion Done?')
        .when(sfn.Condition.stringEquals(verifyDeleteInstancesTaskStatusPath, 'SUCCESS'), pass)
        .when(sfn.Condition.stringEquals(verifyDeleteInstancesTaskStatusPath, 'IN_PROGRESS'), waitDeleteInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    waitTask.next(verifyTask).next(
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
