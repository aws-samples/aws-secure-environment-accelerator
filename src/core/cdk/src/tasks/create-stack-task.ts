import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';

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

  constructor(scope: cdk.Construct, id: string, props: CreateStackTask.Props) {
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
      resultPath: 'DISCARD',
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStack.create',
      },
    });

    const verifyTaskResultPath = '$.verify';
    const verifyTaskStatusPath = `${verifyTaskResultPath}.status`;
    const verifyTask = new CodeTask(scope, `Verify${suffix}`, {
      resultPath: verifyTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createStack.verify',
      },
    });

    const waitTask = new sfn.Wait(scope, `Wait${suffix}`, {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, `Succeeded${suffix}`);

    const fail = new sfn.Fail(this, `Failed${suffix}`);

    const chain = sfn.Chain.start(deployTask)
      .next(waitTask)
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, `Choice${suffix}`)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
