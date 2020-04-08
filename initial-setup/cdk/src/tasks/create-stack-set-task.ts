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

    const verifyInstancesTaskResultPath = '$.verifyInstancesOutput';
    const verifyInstancesTaskStatusPath = `${verifyInstancesTaskResultPath}.status`;
    const verifyInstancesTask = new CodeTask(scope, 'Verify Stack Set Instances Creation', {
      resultPath: verifyInstancesTaskResultPath,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/verify'),
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait For Stack Set Creation', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const waitInstancesTask = new sfn.Wait(scope, 'Wait for Stack Set Instances Creation', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'Stack Set Creation Succeeded');

    const fail = new sfn.Fail(this, 'Stack Set Creation Failed');

    createInstancesTask.next(
      new sfn.Choice(scope, 'Stack Set Instances Created?')
        .when(sfn.Condition.stringEquals(createInstancesTaskStatusPath, 'UP_TO_DATE'), pass)
        .when(sfn.Condition.stringEquals(createInstancesTaskStatusPath, 'SUCCESS'), waitInstancesTask)
        .otherwise(fail)
        .afterwards(),
    );

    waitInstancesTask
      .next(verifyInstancesTask)
      .next(
        new sfn.Choice(scope, 'Stack Set Instances Creation Done?')
          .when(sfn.Condition.stringEquals(verifyInstancesTaskStatusPath, 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals(verifyInstancesTaskStatusPath, 'IN_PROGRESS'), waitInstancesTask)
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
