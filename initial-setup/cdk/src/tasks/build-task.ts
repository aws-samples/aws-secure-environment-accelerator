import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';

export namespace BuildTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    functionPayload?: { [key: string]: unknown };
    waitSeconds?: number;
  }
}

export class BuildTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: BuildTask.Props) {
    super(scope, id);

    const { role, lambdaCode, functionPayload, waitSeconds = 10 } = props;

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

    const startTaskResultPath = '$.startBuildOutput';
    const startTaskStatusPath = `${startTaskResultPath}.status`;
    const startTask = new CodeTask(scope, `Start Build`, {
      resultPath: startTaskResultPath,
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.codebuild.start',
      },
    });

    const verifyTaskResultPath = '$.verifyBuildOutput';
    const verifyTaskStatusPath = `${verifyTaskResultPath}.status`;
    const verifyTask = new CodeTask(scope, 'Verify Build Status', {
      resultPath: verifyTaskResultPath,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.codebuild.verify',
      },
      functionPayload: {
        'buildId.$': `${startTaskResultPath}.buildId`,
      },
    });

    const waitTask = new sfn.Wait(scope, 'Wait for Build', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, 'Build Succeeded');

    const fail = new sfn.Fail(this, 'Build Failed');

    waitTask
      .next(verifyTask)
      .next(
        new sfn.Choice(scope, 'Build Finished?')
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'IN_PROGRESS'), waitTask)
          .otherwise(fail)
          .afterwards(),
      );

    const chain = sfn.Chain.start(startTask).next(
      new sfn.Choice(scope, 'Build Started?')
        .when(sfn.Condition.stringEquals(startTaskStatusPath, 'SUCCESS'), waitTask)
        .otherwise(fail)
        .afterwards(),
    );

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
