import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';

export namespace RunAcrossAccountsTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
    assumeRoleName: string;
    lambdaPath: string;
    name: string;
    permissions?: string[];
    baselineCheck?: boolean;
  }
}

export class RunAcrossAccountsTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: RunAcrossAccountsTask.Props) {
    super(scope, id);

    const { role, lambdaCode, name, lambdaPath, permissions, assumeRoleName, baselineCheck, waitSeconds = 60 } = props;

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );
    if (permissions && permissions.length > 0) {
      role.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          resources: ['*'],
          actions: permissions,
        }),
      );
    }

    const runTask = new CodeTask(scope, name, {
      resultPath: '$',
      functionProps: {
        role,
        code: lambdaCode,
        handler: `${lambdaPath}.run`,
      },
      functionPayload: {
        'account.$': '$.account',
        assumeRoleName,
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'stackOutputSecretId.$': '$.stackOutputSecretId',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
      },
    });

    // Create Map task to iterate
    const mapTask = new sfn.Map(this, `${name} Map`, {
      itemsPath: '$.accounts',
      resultPath: '$.errors',
      maxConcurrency: 5,
      parameters: {
        'account.$': '$$.Map.Item.Value',
        assumeRoleName,
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'stackOutputSecretId.$': '$.stackOutputSecretId',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
      },
    });
    mapTask.iterator(runTask);

    const verifyTask = new CodeTask(scope, `${name} Verify`, {
      resultPath: '$',
      functionProps: {
        role,
        code: lambdaCode,
        handler: `${lambdaPath}.verify`,
      },
      inputPath: '$',
    });

    const pass = new sfn.Pass(this, `${name} Success`, {
      resultPath: 'DISCARD',
    });

    const fail = new sfn.Fail(this, `${name} Failed`);

    const isTaskSuccess = new sfn.Choice(scope, `${name} Deleted?`)
      .when(sfn.Condition.stringEquals('$.status', 'SUCCESS'), pass)
      .otherwise(fail);

    let chain: sfn.Chain;
    if (baselineCheck) {
      mapTask.next(verifyTask).next(isTaskSuccess);
      // Add more conditions if required.
      const baselineChoice = new sfn.Choice(scope, `${name}Baseline?`, {
        comment: 'Baseline?',
      })
        .when(sfn.Condition.stringEquals(`$.baseline`, 'ORGANIZATIONS'), mapTask)
        .otherwise(pass);
      chain = sfn.Chain.start(baselineChoice);
    } else {
      chain = sfn.Chain.start(mapTask).next(verifyTask).next(isTaskSuccess);
    }

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
