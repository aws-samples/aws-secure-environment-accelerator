import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';

export namespace CreateStackSetTask {
  export interface TaskProps {
    role: iam.IRole;
    lambdas: WebpackBuild;
    functionPayload?: { [key: string]: unknown };
    waitSeconds?: number;
  }

  export interface Props extends Omit<sfn.StateMachineProps, 'definition'> {
    taskProps: TaskProps;
  }
}

export class CreateStackSetStateMachine extends sfn.StateMachine {
  constructor(scope: cdk.Construct, id: string, props: CreateStackSetTask.Props) {
    super(scope, id, {
      definition: new CreateStackSetTask(scope, 'CreateStackSetTask', props.taskProps),
    });
  }
}

export class CreateStackSetTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateStackSetTask.TaskProps) {
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

    const createTask = new CodeTask(scope, `Start Stack Set Creation`, {
      resultPath: 'DISCARD',
      functionPayload,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/create-stack-set'),
      },
    });

    const verifyTask = new CodeTask(scope, 'Verify Stack Set Creation', {
      resultPath: '$.verifyStackOutput',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/verify'),
      },
    });

    const createInstancesTask = new CodeTask(scope, `Start Stack Set Instance Creation`, {
      resultPath: 'DISCARD',
      functionPayload,
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/create-stack-set-instances'),
      },
    });

    const verifyInstancesTask = new CodeTask(scope, 'Verify Stack Set Instances Creation', {
      resultPath: '$.verifyInstancesOutput',
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

    createInstancesTask
      .next(waitInstancesTask)
      .next(verifyInstancesTask)
      .next(
        new sfn.Choice(scope, 'Stack Set Instances Created?')
          .when(sfn.Condition.stringEquals('$.verifyInstancesOutput.status', 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals('$.verifyInstancesOutput.status', 'FAILURE'), fail)
          .otherwise(waitInstancesTask)
          .afterwards(),
      );

    const chain = sfn.Chain.start(createTask)
      .next(waitTask)
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'Stack Set Created?')
          .when(sfn.Condition.stringEquals('$.verifyStackOutput.status', 'SUCCESS'), createInstancesTask)
          .when(sfn.Condition.stringEquals('$.verifyStackOutput.status', 'FAILURE'), fail)
          .otherwise(waitTask)
          .afterwards(),
      );

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
