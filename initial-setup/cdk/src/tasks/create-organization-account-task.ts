import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';

export namespace CreateOrganizationAccountTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
  }
}

export class CreateOrganizationAccountTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CreateOrganizationAccountTask.Props) {
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
        actions: ['organizations:CreateAccount', 'organizations:DescribeCreateAccountStatus'],
      }),
    );

    const createTaskResultPath = '$.createOutput';
    const createTaskStatusPath = `${createTaskResultPath}.status`;
    const createTask = new CodeTask(scope, `Start Organization Account Creation`, {
      resultPath: createTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createOrganizationAccount.create',
      },
      inputPath: '$.createAccountConfiguration.account',
    });

    const verifyTaskResultPath = '$.verifyOutput';
    const verifyTaskStatusPath = `${verifyTaskResultPath}.status`;
    const verifyTask = new CodeTask(scope, 'Verify Org Account Creation', {
      resultPath: verifyTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.createOrganizationAccount.verify',
      },
      functionPayload: {
        'account.$': '$.createAccountConfiguration.account',
        'requestId.$': '$.createOutput.provisionToken',
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait for Org Account Creation', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'Org Account Creation Succeeded');

    const fail = new sfn.Fail(this, 'Org Account Creation Failed');

    const moveAccountToOrgTask = new CodeTask(scope, 'Move Account To Organization', {
      resultPath: 'DISCARD',
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.moveAccountToOrg',
      },
      functionPayload: {
        'account.$': '$.createAccountConfiguration.account',
        'accountId.$': '$.verifyOutput.accountId',
        'organizationalUnits.$': '$.createAccountConfiguration.organizationalUnits',
      },
    });
    moveAccountToOrgTask.next(pass);

    waitTask
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'Org Account Creation Done?')
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'SUCCEEDED'), moveAccountToOrgTask)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'ALREADY_EXISTS'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'NON_MANDATORY_ACCOUNT_FAILURE'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    createTask.next(
      new sfn.Choice(scope, 'Account Creation Started?')
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'SUCCEEDED'), waitTask)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'NON_MANDATORY_ACCOUNT_FAILURE'), pass)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'ALREADY_EXISTS'), pass)
        .when(sfn.Condition.stringEquals(createTaskStatusPath, 'IN_PROGRESS'), waitTask)
        .otherwise(fail)
        .afterwards(),
    );

    this.startState = createTask.startState;
    this.endStates = fail.endStates;
  }
}
