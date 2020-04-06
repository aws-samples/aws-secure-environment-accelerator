import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';

export namespace CreateStackTask {
  export interface Props {
    role: iam.IRole;
    lambdas: WebpackBuild;
    waitSeconds?: number;
  }
}

export class CreateStackTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateStackTask.Props) {
    super(scope, id);

    const { role, lambdas, waitSeconds = 10 } = props;

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
    const finalizeTask = new CodeTask(scope, 'FinalizeTask', {
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack/finalize'),
      },
    });

    const deployTask = new CodeTask(scope, `Deploy`, {
      resultPath: 'DISCARD',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack/create'),
      },
    });
    deployTask.addCatch(finalizeTask, {
      resultPath: '$.exception',
    });

    const verifyTask = new CodeTask(scope, 'Verify', {
      resultPath: '$.verify',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack/verify'),
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const chain = sfn.Chain.start(deployTask)
      .next(waitTask)
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'Choice')
          .when(sfn.Condition.stringEquals('$.verify.status', 'SUCCESS'), finalizeTask)
          .when(sfn.Condition.stringEquals('$.verify.status', 'FAILURE'), finalizeTask)
          .otherwise(waitTask)
          .afterwards(),
      );

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
