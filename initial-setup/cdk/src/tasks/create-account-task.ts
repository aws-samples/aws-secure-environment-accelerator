import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';

export namespace CreateAccountTask {
  export interface TaskProps {
    role: iam.IRole;
    lambdas: WebpackBuild;
    waitSeconds?: number;
  }

  export interface Props extends Omit<sfn.StateMachineProps, 'definition'> {
    taskProps: TaskProps;
  }
}

export class CreateAccountStateMachine extends sfn.StateMachine {
  constructor(scope: cdk.Construct, id: string, props: CreateAccountTask.Props) {
    super(scope, id, {
      definition: new CreateAccountTask(scope, 'CreateAccountTask', props.taskProps),
    });
  }
}

export class CreateAccountTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateAccountTask.TaskProps) {
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
          'servicecatalog:ListPortfolios',
          'servicecatalog:AssociatePrincipalWithPortfolio',
          'servicecatalog:SearchProducts',
          'servicecatalog:ListProvisioningArtifacts',
          'servicecatalog:ProvisionProduct',
          'servicecatalog:SearchProvisionedProducts',
        ],
      }),
    );

    const createTask = new CodeTask(scope, `Start Account Creation`, {
      resultPath: '$.createOutput',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-account/create'),
      },
    });

    const verifyTask = new CodeTask(scope, 'Verify Account Creation', {
      resultPath: '$.verifyOutput',
      functionProps: {
        role,
        code: lambdas.codeForEntry('create-account/verify'),
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait for Account Creation', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'Account Creation Succeeded');

    const fail = new sfn.Fail(this, 'Account Creation Failed');

    waitTask.next(verifyTask).next(
      new sfn.Choice(scope, 'Account Creation Done?')
        .when(sfn.Condition.stringEquals('$.verifyOutput.status', 'SUCCESS'), pass)
        .when(sfn.Condition.stringEquals('$.verifyOutput.status', 'FAILURE'), fail)
        .otherwise(waitTask)
        .afterwards(),
    );

    createTask.next(
      new sfn.Choice(scope, 'Account Creation Started?')
        .when(sfn.Condition.stringEquals('$.createOutput.status', 'ALREADY_EXISTS'), pass)
        .when(sfn.Condition.stringEquals('$.createOutput.status', 'NOT_RELEVANT'), pass)
        .when(sfn.Condition.not(sfn.Condition.stringEquals('$.createOutput.status', 'SUCCESS')), fail)
        .otherwise(waitTask)
        .afterwards(),
    );

    this.startState = createTask.startState;
    this.endStates = fail.endStates;
  }
}
