import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';

export namespace CreateStackSetTask {
  export interface Props {
    role: iam.IRole;
    lambdas: WebpackBuild;
    waitSeconds?: number;
  }
}

export class CreateStackSetTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateStackSetTask.Props) {
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
        code: lambdas.codeForEntry('create-stack-set/finalize'),
      },
    });

    const deployStackSetTask = new CodeTask(scope, `DeployStackSet`, {
      resultPath: 'DISCARD',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/create-stack-set'),
      },
    });
    deployStackSetTask.addCatch(finalizeTask, {
      resultPath: '$.exception',
    });

    const verifyStackSetTask = new CodeTask(scope, 'VerifyStackSet', {
      resultPath: '$.verify',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/verify'),
      },
    });

    const deployStackSetInstancesTask = new CodeTask(scope, `DeployStackSetInstances`, {
      resultPath: 'DISCARD',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/create-stack-set-instances'),
      },
    });
    deployStackSetInstancesTask.addCatch(finalizeTask, {
      resultPath: '$.exception',
    });

    const verifyStackSetInstancesTask = new CodeTask(scope, 'VerifyStackSetInstances', {
      resultPath: '$.verify',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-stack-set/verify'),
      },
    });

    const waitStackSetTask = new sfn.Wait(scope, 'WaitForStackSet', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const waitStackSetInstancesTask = new sfn.Wait(scope, 'WaitForStackSetInstances', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const chain = sfn.Chain.start(deployStackSetTask)
      .next(waitStackSetTask)
      .next(verifyStackSetTask)
      .next(
        new sfn.Choice(scope, 'StackSetDeployed?')
          .when(
            sfn.Condition.stringEquals('$.verify.status', 'SUCCESS'),
            sfn.Chain.start(deployStackSetInstancesTask)
              .next(waitStackSetInstancesTask)
              .next(verifyStackSetInstancesTask)
              .next(
                new sfn.Choice(scope, 'StackSetInstancesDeployed?')
                  .when(sfn.Condition.stringEquals('$.verify.status', 'SUCCESS'), finalizeTask)
                  .when(sfn.Condition.stringEquals('$.verify.status', 'FAILURE'), finalizeTask)
                  .otherwise(waitStackSetInstancesTask)
                  .afterwards(),
              ),
          )
          .when(sfn.Condition.stringEquals('$.verify.status', 'FAILURE'), finalizeTask)
          .otherwise(waitStackSetTask)
          .afterwards(),
      );

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
