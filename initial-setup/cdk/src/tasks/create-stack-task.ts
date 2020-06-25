import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';

export namespace CreateStackTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
  }
}

export class CreateStackTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateStackTask.Props) {
    super(scope, id);

    const { role, lambdaCode, waitSeconds = 10 } = props;

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

    const deployTask = new CodeTask(scope, `Deploy`, {
      resultPath: 'DISCARD',
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStack.create',
      },
    });

    const verifyTaskResultPath = '$.verify';
    const verifyTaskStatusPath = `${verifyTaskResultPath}.status`;
    const verifyTask = new CodeTask(scope, 'Verify', {
      resultPath: verifyTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStack.verify',
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'Succeeded');

    const fail = new sfn.Fail(this, 'Failed');

    const chain = sfn.Chain.start(deployTask)
      .next(waitTask)
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'Choice')
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
