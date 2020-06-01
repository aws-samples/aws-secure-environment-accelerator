import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';

export namespace CreateAccountTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
  }
}

export class CreateAccountTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateAccountTask.Props) {
    super(scope, id);

    const { role, lambdaCode, waitSeconds = 60 } = props;

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

    const createTaskResultPath = '$.createOutput';
    const createTaskStatusPath = `${createTaskResultPath}.status`;
    const createTask = new CodeTask(scope, `Start Account Creation`, {
      resultPath: createTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createAccount.create',
      },
    });

    const verifyTaskResultPath = '$.verifyOutput';
    const verifyTaskStatusPath = `${verifyTaskResultPath}.status`;
    const verifyTask = new CodeTask(scope, 'Verify Account Creation', {
      resultPath: verifyTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createAccount.verify',
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait for Account Creation', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'Account Creation Succeeded');

    const fail = new sfn.Fail(this, 'Account Creation Failed');

    waitTask
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'Account Creation Done?')
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'NON_MANDATORY_ACCOUNT_FAILURE'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    createTask.next(
      new sfn.Choice(scope, 'Account Creation Started?')
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'SUCCESS'), waitTask)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'NON_MANDATORY_ACCOUNT_FAILURE'), pass)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'ALREADY_EXISTS'), pass)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'NOT_RELEVANT'), pass)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'IN_PROGRESS'), waitTask)
        .otherwise(fail)
        .afterwards(),
    );

    this.startState = createTask.startState;
    this.endStates = fail.endStates;
  }
}
