import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';
import { CreateStackTask } from './create-stack-task';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';

export namespace CDKBootstrapTask {
  export interface Props {
    role: iam.IRole;
    lambdaCode: lambda.Code;
    acceleratorPrefix: string;
    s3BucketName: string;
    operationsBootstrapObjectKey: string;
    accountBootstrapObjectKey: string;
    assumeRoleName: string;
    bootStrapStackName: string;
    functionPayload?: { [key: string]: unknown };
    waitSeconds?: number;
  }
}

export class CDKBootstrapTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CDKBootstrapTask.Props) {
    super(scope, id);

    const {
      role,
      lambdaCode,
      acceleratorPrefix,
      assumeRoleName,
      operationsBootstrapObjectKey,
      s3BucketName,
      accountBootstrapObjectKey,
      bootStrapStackName,
      waitSeconds = 10,
    } = props;

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );

    const getAccountInfoTask = new CodeTask(scope, `Get Operations Account Info`, {
      resultPath: '$.operationsAccount',
      functionPayload: {
        'configRepositoryName.$': '$.configRepositoryName',
        'configFilePath.$': '$.configFilePath',
        'configCommitId.$': '$.configCommitId',
        'accountsTableName.$': '$.accountsTableName',
        accountType: 'central-operations',
      },
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.getAccountInfo',
      },
    });

    const createRootBootstrapInRegion = new sfn.Map(this, `Bootstrap Operations Account`, {
      itemsPath: `$.regions`,
      resultPath: '$.bootstrap',
      maxConcurrency: 20,
      parameters: {
        'accountId.$': '$.operationsAccount.id',
        'organizationId.$': '$.operationsAccount.ou',
        'region.$': '$$.Map.Item.Value',
        acceleratorPrefix: acceleratorPrefix.endsWith('-')
          ? acceleratorPrefix.slice(0, -1).toLowerCase()
          : acceleratorPrefix.toLowerCase(),
        assumeRoleName,
      },
    });

    const bootstrapMasterStateMachine = new sfn.StateMachine(
      this,
      `${acceleratorPrefix}BootstrapOperationsAccount_sm`,
      {
        stateMachineName: `${props.acceleratorPrefix}BootstrapOperationsAccount_sm`,
        definition: new CreateStackTask(this, 'Bootstrap Operations Acccount Task', {
          lambdaCode,
          role,
          suffix: 'Operations',
        }),
      },
    );

    const bootstrapOpsTask = new tasks.StepFunctionsStartExecution(this, 'Bootstrap Operations Acccount', {
      stateMachine: bootstrapMasterStateMachine,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      input: sfn.TaskInput.fromObject({
        stackName: bootStrapStackName,
        stackCapabilities: ['CAPABILITY_NAMED_IAM'],
        stackParameters: {
          'OrganizationId.$': '$.organizationId',
          'Qualifier.$': '$.acceleratorPrefix',
        },
        stackTemplate: {
          s3BucketName,
          s3ObjectKey: operationsBootstrapObjectKey,
        },
        'accountId.$': '$.accountId',
        assumeRoleName,
        'region.$': '$.region',
      }),
      resultPath: '$.opsBootstrapOutput',
    });
    createRootBootstrapInRegion.iterator(bootstrapOpsTask);

    const getBootstrapOutput = new CodeTask(scope, `Get Bootstrap output`, {
      resultPath: '$.bootstrap',
      functionPayload: {
        'stackOutputs.$': '$.bootstrap',
        'accounts.$': '$.accounts',
        'operationsAccountId.$': '$.operationsAccount.id',
      },
      functionProps: {
        role,
        code: lambdaCode,
        handler: 'index.getBootstrapOutput',
      },
    });

    const chain = sfn.Chain.start(getAccountInfoTask).next(createRootBootstrapInRegion).next(getBootstrapOutput);
    // .next(createBootstrapInAccount);

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
