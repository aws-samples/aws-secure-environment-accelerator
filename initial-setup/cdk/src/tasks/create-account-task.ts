import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';

export namespace CreateAccountTask {
  export interface Props {
    role: iam.IRole;
    lambdas: WebpackBuild;
    waitSeconds?: number;
  }
}

export class CreateAccountTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateAccountTask.Props) {
    super(scope, id);

    const { role, lambdas, waitSeconds = 60 } = props;

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
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: [
          'servicecatalog:listPortfolios',
          'servicecatalog:associatePrincipalWithPortfolio',
          'servicecatalog:SearchProducts',
          'servicecatalog:ListProvisioningArtifacts',
          'servicecatalog:ProvisionProduct',
          'servicecatalog:SearchProvisionedProducts',
        ],
      }),
    );
    const finalizeTask = new CodeTask(scope, 'FinalizeTask', {
      functionProps: {
        role: role,
        code: lambdas.codeForEntry('create-account/finalize'),
      },
    });

    const deployTask = new CodeTask(scope, `Create`, {
      resultPath: '$.create',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-account/create'),
      },
    });
    deployTask.addCatch(finalizeTask, {
      resultPath: '$.exception',
    });

    const verifyTask = new CodeTask(scope, 'Verify', {
      resultPath: '$.verify',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-account/verify'),
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
