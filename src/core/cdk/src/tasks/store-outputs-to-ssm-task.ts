import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';

export namespace StoreOutputsToSSMTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    functionPayload?: { [key: string]: unknown };
    waitSeconds?: number;
  }
}

export class StoreOutputsToSSMTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: StoreOutputsToSSMTask.Props) {
    super(scope, id);

    const { role, lambdaCode, functionPayload, waitSeconds = 10 } = props;

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );

    const storeAccountOutputs = new sfn.Map(this, `Store Account Outputs To SSM`, {
      itemsPath: `$.accounts`,
      resultPath: 'DISCARD',
      maxConcurrency: 10,
      parameters: {
        'accountId.$': '$$.Map.Item.Value',
        'regions.$': '$.regions',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
        'assumeRoleName.$': '$.assumeRoleName',
        'outputsTableName.$': '$.outputsTableName',
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'outputUtilsTableName.$': '$.outputUtilsTableName',
        'accountsTableName.$': '$.accountsTableName',
      },
    });

    const getAccountInfoTask = new CodeTask(scope, `Get Account Details`, {
      comment: 'Get Account Info',
      resultPath: '$.account',
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.getAccountInfo',
      },
    });

    const storeAccountRegionOutputs = new sfn.Map(this, `Store Account Region Outputs To SSM`, {
      itemsPath: `$.regions`,
      resultPath: 'DISCARD',
      maxConcurrency: 10,
      parameters: {
        'account.$': '$.account',
        'region.$': '$$.Map.Item.Value',
        'acceleratorPrefix.$': '$.acceleratorPrefix',
        'assumeRoleName.$': '$.assumeRoleName',
        'outputsTableName.$': '$.outputsTableName',
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'outputUtilsTableName.$': '$.outputUtilsTableName',
        'accountsTableName.$': '$.accountsTableName',
      },
    });

    getAccountInfoTask.next(storeAccountRegionOutputs);
    const storeOutputsTask = new CodeTask(scope, `Store Outputs To SSM`, {
      resultPath: '$.storeOutputsOutput',
      functionPayload,
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.saveOutputsToSSM',
      },
    });

    const pass = new sfn.Pass(this, 'Store Outputs To SSM Success');
    storeAccountOutputs.iterator(getAccountInfoTask);
    storeAccountRegionOutputs.iterator(storeOutputsTask);
    const chain = sfn.Chain.start(storeAccountOutputs).next(pass);

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
