import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';

const runOptions = [
  {
    type: 'DeleteDefaultVPC',
    permissions: [],
    lambdaPath: 'index.deleteDefaultVpcs',
    verboseNamePlural: 'Delete Default VPCs',
    verboseName: 'Delete Default VPC',
  },
];
export namespace RunAcrossAccountsTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    waitSeconds?: number;
    type: string;
    assumeRoleName: string;
  }
}

export class RunAcrossAccountsTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: RunAcrossAccountsTask.Props) {
    super(scope, id);

    const { role, lambdaCode, type, waitSeconds = 60, assumeRoleName } = props;

    const options = runOptions.find(op => op.type === type);
    if (!options) {
      throw new Error(`Invalid type supplied "${type}", please add proper config in run accross accounts task`);
    }
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );
    if (options.permissions.length > 0) {
      role.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          resources: ['*'],
          actions: options.permissions,
        }),
      );
    }

    const runTask = new CodeTask(scope, options.verboseName, {
      resultPath: '$',
      functionProps: {
        role,
        code: lambdaCode,
        handler: `${options.lambdaPath}.run`,
      },
      functionPayload: {
        'account.$': '$.account',
        assumeRoleName,
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
      },
    });

    // Create Map task to iterate
    const mapTask = new sfn.Map(this, options.verboseNamePlural, {
      itemsPath: '$.accounts',
      resultPath: '$.errors',
      maxConcurrency: 1,
      parameters: {
        'account.$': '$$.Map.Item.Value',
        assumeRoleName,
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
      },
    });
    mapTask.iterator(runTask);

    const verifyTask = new CodeTask(scope, `${options.verboseNamePlural} Verify`, {
      resultPath: '$',
      functionProps: {
        role,
        code: lambdaCode,
        handler: `${options.lambdaPath}.verify`,
      },
      inputPath: '$',
    });

    const pass = new sfn.Pass(this, `Success`, {
      resultPath: 'DISCARD',
    });

    const fail = new sfn.Fail(this, `Failed`);

    const isTaskSuccess = new sfn.Choice(scope, `Deleted?`)
      .when(sfn.Condition.stringEquals('$.status', 'SUCCESS'), pass)
      .otherwise(fail);

    const chain = sfn.Chain.start(mapTask).next(verifyTask).next(isTaskSuccess);

    this.startState = chain.startState;
    this.endStates = fail.endStates;
  }
}
