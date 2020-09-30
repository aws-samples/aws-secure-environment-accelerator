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
    assumeRoleName: string;
    functionPayload?: { [key: string]: unknown };
    waitSeconds?: number;
  }
}

export class CDKBootstrapTask extends sfn.StateMachineFragment {
  readonly startState: sfn.State;
  readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CDKBootstrapTask.Props) {
    super(scope, id);

    const { role, lambdaCode, acceleratorPrefix, assumeRoleName, operationsBootstrapObjectKey, s3BucketName, waitSeconds = 10 } = props;

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );

    const getAccountInfoTask = new CodeTask(scope, `Get Operations Account Info`, {
      resultPath: '$.opsAccount',
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
        'account.$': '$.opsAccount',
        'region.$': '$$.Map.Item.Value',
        acceleratorPrefix,
        assumeRoleName: assumeRoleName,
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
        }),
      },
    );

    const bootstrapOpsTask = new sfn.Task(this, 'Bootstrap Operations Acccount', {
      // tslint:disable-next-line: deprecation
      task: new tasks.StartExecution(bootstrapMasterStateMachine, {
        integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
        input: {
          stackName: `${props.acceleratorPrefix}CDKToolKit`,
          stackCapabilities: ['CAPABILITY_NAMED_IAM'],
          stackParameters: {
            'OrganizationId.$': '$.account.ou',
          },
          stackTemplate: {
            s3BucketName: s3BucketName,
            s3ObjectKey: operationsBootstrapObjectKey,
          },
        },
      }),
      resultPath: 'DISCARD',
    });
    createRootBootstrapInRegion.iterator(bootstrapOpsTask);
    const chain = sfn.Chain.start(getAccountInfoTask).next(createRootBootstrapInRegion);

    this.startState = chain.startState;
    this.endStates = chain.endStates;
  }
}
