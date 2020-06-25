import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3assets from '@aws-cdk/aws-s3-assets';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import { CdkDeployProject, PrebuiltCdkDeployProject } from '@aws-pbmm/common-cdk/lib/codebuild';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { createRoleName, createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';
import { CreateAccountTask } from './tasks/create-account-task';
import { CreateStackSetTask } from './tasks/create-stack-set-task';
import { CreateAdConnectorTask } from './tasks/create-adconnector-task';
import { BuildTask } from './tasks/build-task';

export namespace InitialSetup {
  export interface CommonProps {
    acceleratorPrefix: string;
    acceleratorName: string;
    solutionRoot: string;
    stateMachineName: string;
    stateMachineExecutionRole: string;
    /**
     * Parameters for configuration file
     */
    configFilePath: string;
    configRepositoryName: string;
    configS3Bucket: string;
    configS3FileName: string;
    configBranchName: string;
    /**
     * Prebuild Docker image that contains the project with its dependencies already installed.
     */
    enablePrebuiltProject?: boolean;
  }

  export interface Props extends AcceleratorStackProps, CommonProps {}
}

export class InitialSetup extends AcceleratorStack {
  constructor(scope: cdk.Construct, id: string, props: InitialSetup.Props) {
    super(scope, id, props);

    new InitialSetup.Pipeline(this, 'Pipeline', props);
  }
}

export namespace InitialSetup {
  export type PipelineProps = CommonProps;

  export class Pipeline extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: PipelineProps) {
      super(scope, id);

      const { enablePrebuiltProject } = props;

      const lambdaPath = require.resolve('@aws-pbmm/initial-setup-lambdas');
      const lambdaDir = path.dirname(lambdaPath);
      const lambdaCode = lambda.Code.fromAsset(lambdaDir);

      const stack = cdk.Stack.of(this);

      const accountsSecret = new secrets.Secret(this, 'Accounts', {
        secretName: 'accelerator/accounts',
        description: 'This secret contains the information about the accounts that are used for deployment.',
      });

      const stackOutputSecret = new secrets.Secret(this, 'StackOutput', {
        secretName: 'accelerator/outputs',
        description: 'This secret contains a copy of the outputs of the Accelerator stacks.',
      });

      const limitsSecret = new secrets.Secret(this, 'Limits', {
        secretName: 'accelerator/limits',
        description: 'This secret contains a copy of the service limits of the Accelerator accounts.',
      });

      // This is the maximum time before a build times out
      // The role used by the build should allow this session duration
      const buildTimeout = cdk.Duration.hours(4);

      // The pipeline stage `InstallRoles` will allow the pipeline role to assume a role in the sub accounts
      const pipelineRole = new iam.Role(this, 'Role', {
        roleName: createRoleName('L-SFN-MasterRole'),
        assumedBy: new iam.CompositePrincipal(
          // TODO Only add root role for development environments
          new iam.ServicePrincipal('codebuild.amazonaws.com'),
          new iam.ServicePrincipal('lambda.amazonaws.com'),
        ),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
        maxSessionDuration: buildTimeout,
      });

      // Add a suffix to the CodeBuild project so it creates a new project as it's not able to update the `baseImage`
      const projectNameSuffix = enablePrebuiltProject ? 'Prebuilt' : '';
      const projectConstructor = enablePrebuiltProject ? PrebuiltCdkDeployProject : CdkDeployProject;
      const project = new projectConstructor(this, `CdkDeploy${projectNameSuffix}`, {
        projectName: createName({
          name: `Deploy${projectNameSuffix}`,
          region: false,
          account: false,
        }),
        role: pipelineRole,
        projectRoot: props.solutionRoot,
        packageManager: 'pnpm',
        commands: ['cd initial-setup/templates', 'sh codebuild-deploy.sh'],
        timeout: buildTimeout,
        environment: {
          ACCELERATOR_NAME: props.acceleratorName,
          ACCELERATOR_PREFIX: props.acceleratorPrefix,
          ACCELERATOR_EXECUTION_ROLE_NAME: props.stateMachineExecutionRole,
          CDK_PLUGIN_ASSUME_ROLE_NAME: props.stateMachineExecutionRole,
          CDK_PLUGIN_ASSUME_ROLE_DURATION: `${buildTimeout.toSeconds()}`,
          ACCOUNTS_SECRET_ID: accountsSecret.secretArn,
          STACK_OUTPUT_SECRET_ID: stackOutputSecret.secretArn,
          LIMITS_SECRET_ID: limitsSecret.secretArn,
        },
      });

      const getOrCreateConfigurationTask = new CodeTask(this, 'Get or Create Configuration from S3', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.getOrCreateConfig',
          role: pipelineRole,
        },
        functionPayload: {
          repositoryName: props.configRepositoryName,
          filePath: props.configFilePath,
          s3Bucket: props.configS3Bucket,
          s3FileName: props.configS3FileName,
          branchName: props.configBranchName,
        },
        resultPath: '$.configuration',
      });

      const compareConfigurationsTask = new CodeTask(this, 'Compare Configurations', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.compareConfigurationsStep',
          role: pipelineRole,
        },
        functionPayload: {
          'inputConfig.$': '$',
          region: cdk.Aws.REGION,
        },
        resultPath: '$.configuration',
      });

      const loadConfigurationTask = new CodeTask(this, 'Load Configuration', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.loadConfigurationStep',
          role: pipelineRole,
        },
        functionPayload: {
          configRepositoryName: props.configRepositoryName,
          configFilePath: props.configFilePath,
          'configCommitId.$': '$.configuration.configCommitId',
        },
        resultPath: '$.configuration',
      });

      // TODO We might want to load this from the Landing Zone configuration
      const avmProductName = 'AWS-Landing-Zone-Account-Vending-Machine';
      const avmPortfolioName = 'AWS Landing Zone - Baseline';

      const addRoleToServiceCatalog = new CodeTask(this, 'Add Execution Role to Service Catalog', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.addRoleToServiceCatalogStep',
          role: pipelineRole,
        },
        functionPayload: {
          roleArn: pipelineRole.roleArn,
          portfolioName: avmPortfolioName,
        },
        inputPath: '$.configuration',
        resultPath: 'DISCARD',
      });

      const createAccountStateMachine = new sfn.StateMachine(scope, `${props.acceleratorPrefix}CreateAccount_sm`, {
        stateMachineName: `${props.acceleratorPrefix}CreateAccount_sm`,
        definition: new CreateAccountTask(scope, 'Create', {
          lambdaCode,
          role: pipelineRole,
        }),
      });

      const createAccountTask = new sfn.Task(this, 'Create Account', {
        // tslint:disable-next-line: deprecation
        task: new tasks.StartExecution(createAccountStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            avmProductName,
            avmPortfolioName,
            'account.$': '$',
          },
        }),
      });

      const createAccountsTask = new sfn.Map(this, 'Create Accounts', {
        itemsPath: '$.configuration.accounts',
        resultPath: 'DISCARD',
        maxConcurrency: 1,
      });

      createAccountsTask.iterator(createAccountTask);

      const loadAccountsTask = new CodeTask(this, 'Load Accounts', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.loadAccountsStep',
          role: pipelineRole,
        },
        functionPayload: {
          accountsSecretId: accountsSecret.secretArn,
          'configuration.$': '$.configuration',
        },
        resultPath: '$',
      });

      const installRoleTemplate = new s3assets.Asset(this, 'ExecutionRoleTemplate', {
        path: path.join(__dirname, 'assets', 'execution-role.template.json'),
      });

      // Make sure the Lambda can read the template
      installRoleTemplate.bucket.grantRead(pipelineRole);

      const installRolesStateMachine = new sfn.StateMachine(this, `${props.acceleratorPrefix}InstallRoles_sm`, {
        stateMachineName: `${props.acceleratorPrefix}InstallRoles_sm`,
        definition: new CreateStackSetTask(this, 'Install', {
          lambdaCode,
          role: pipelineRole,
        }),
      });

      const installRolesTask = new sfn.Task(this, 'Install Execution Roles', {
        // tslint:disable-next-line: deprecation
        task: new tasks.StartExecution(installRolesStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            stackName: `${props.acceleratorPrefix}PipelineRole`,
            stackCapabilities: ['CAPABILITY_NAMED_IAM'],
            stackParameters: {
              RoleName: props.stateMachineExecutionRole,
              // TODO Only add root role for development environments
              AssumedByRoleArn: `arn:aws:iam::${stack.account}:root,${pipelineRole.roleArn}`,
            },
            stackTemplate: {
              s3BucketName: installRoleTemplate.s3BucketName,
              s3ObjectKey: installRoleTemplate.s3ObjectKey,
            },
            'instanceAccounts.$': '$.accounts[*].id',
            instanceRegions: [stack.region],
          },
        }),
        resultPath: 'DISCARD',
      });

      const loadLimitsTask = new CodeTask(this, 'Load Limits', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.loadLimitsStep',
          role: pipelineRole,
        },
        functionPayload: {
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          limitsSecretId: limitsSecret.secretArn,
          assumeRoleName: props.stateMachineExecutionRole,
          'accounts.$': '$.accounts',
        },
        resultPath: '$.limits',
      });

      const addScpTask = new CodeTask(this, 'Add SCPs to Organization', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.addScpStep',
          role: pipelineRole,
        },
        functionPayload: {
          acceleratorPrefix: props.acceleratorPrefix,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          'organizationalUnits.$': '$.organizationalUnits',
          'accounts.$': '$.accounts',
          stackOutputSecretId: stackOutputSecret.secretArn,
        },
        resultPath: 'DISCARD',
      });

      const enableTrustedAccessForServicesTask = new CodeTask(this, 'Enable Trusted Access For Services', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.enableTrustedAccessForServicesStep',
          role: pipelineRole,
        },
        functionPayload: {
          'accounts.$': '$.accounts',
        },
        resultPath: 'DISCARD',
      });

      const codeBuildStateMachine = new sfn.StateMachine(this, `${props.acceleratorPrefix}CodeBuild_sm`, {
        stateMachineName: `${props.acceleratorPrefix}CodeBuild_sm`,
        definition: new BuildTask(this, 'CodeBuild', {
          lambdaCode,
          role: pipelineRole,
        }),
      });

      // TODO Move this to a separate state machine, including store output task
      const createDeploymentTask = (phase: number) => {
        const deployTask = new sfn.Task(this, `Deploy Phase ${phase}`, {
          // tslint:disable-next-line: deprecation
          task: new tasks.StartExecution(codeBuildStateMachine, {
            integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
            input: {
              codeBuildProjectName: project.projectName,
              environment: {
                ACCELERATOR_PHASE: `${phase}`,
                'CONFIG_REPOSITORY_NAME.$': '$.configRepositoryName',
                'CONFIG_FILE_PATH.$': '$.configFilePath',
                'CONFIG_COMMIT_ID.$': '$.configCommitId',
              },
            },
          }),
          resultPath: 'DISCARD',
        });
        return deployTask;
      };

      const createStoreOutputTask = (phase: number) =>
        new CodeTask(this, `Store Phase ${phase} Output`, {
          functionProps: {
            code: lambdaCode,
            handler: 'index.storeStackOutputStep',
            role: pipelineRole,
          },
          functionPayload: {
            acceleratorPrefix: props.acceleratorPrefix,
            stackOutputSecretId: stackOutputSecret.secretArn,
            assumeRoleName: props.stateMachineExecutionRole,
            'accounts.$': '$.accounts',
            'regions.$': '$.regions',
          },
          resultPath: 'DISCARD',
        });

      // TODO Create separate state machine for deployment
      const deployPhase0Task = createDeploymentTask(0);
      const storePhase0Output = createStoreOutputTask(0);
      const deployPhase1Task = createDeploymentTask(1);
      const storePhase1Output = createStoreOutputTask(1);
      const deployPhase2Task = createDeploymentTask(2);
      const storePhase2Output = createStoreOutputTask(2);
      const deployPhase3Task = createDeploymentTask(3);
      const storePhase3Output = createStoreOutputTask(3);
      const deployPhase4Task = createDeploymentTask(4);
      const storePhase4Output = createStoreOutputTask(4);
      const deployPhase5Task = createDeploymentTask(5);

      // TODO We could put this task in a map task and apply to all accounts individually
      const accountDefaultSettingsTask = new CodeTask(this, 'Account Default Settings', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.accountDefaultSettingsStep',
          role: pipelineRole,
        },
        functionPayload: {
          assumeRoleName: props.stateMachineExecutionRole,
          'accounts.$': '$.accounts',
          stackOutputSecretId: stackOutputSecret.secretArn,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
        },
        resultPath: 'DISCARD',
      });

      const associateHostedZonesTask = new CodeTask(this, 'Associate Hosted Zones', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.associateHostedZonesStep',
          role: pipelineRole,
        },
        functionPayload: {
          'accounts.$': '$.accounts',
          assumeRoleName: props.stateMachineExecutionRole,
          stackOutputSecretId: stackOutputSecret.secretArn,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
        },
        resultPath: 'DISCARD',
      });

      const addTagsToSharedResourcesTask = new CodeTask(this, 'Add Tags to Shared Resources', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.addTagsToSharedResourcesStep',
          role: pipelineRole,
        },
        functionPayload: {
          assumeRoleName: props.stateMachineExecutionRole,
          stackOutputSecretId: stackOutputSecret.secretArn,
        },
        resultPath: 'DISCARD',
      });

      const enableDirectorySharingTask = new CodeTask(this, 'Enable Directory Sharing', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.enableDirectorySharingStep',
          role: pipelineRole,
        },
        functionPayload: {
          'accounts.$': '$.accounts',
          assumeRoleName: props.stateMachineExecutionRole,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          stackOutputSecretId: stackOutputSecret.secretArn,
        },
        resultPath: 'DISCARD',
      });

      const createAdConnectorStateMachine = new sfn.StateMachine(scope, 'CreateAdConnectorStateMachine', {
        stateMachineName: `${props.acceleratorPrefix}CreateAdConnector_sm`,
        definition: new CreateAdConnectorTask(scope, 'CreateAD', {
          lambdaCode,
          role: pipelineRole,
        }),
      });

      const createAdConnectorTask = new sfn.Task(this, 'Create AD Connector', {
        // tslint:disable-next-line: deprecation
        task: new tasks.StartExecution(createAdConnectorStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            acceleratorPrefix: props.acceleratorPrefix,
            'accounts.$': '$.accounts',
            assumeRoleName: props.stateMachineExecutionRole,
            'configRepositoryName.$': '$.configRepositoryName',
            'configFilePath.$': '$.configFilePath',
            'configCommitId.$': '$.configCommitId',
            stackOutputSecretId: stackOutputSecret.secretArn,
          },
        }),
        resultPath: 'DISCARD',
      });

      const storeCommitIdTask = new CodeTask(this, 'Store CommitId', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.storeCommitIdStep',
          role: pipelineRole,
        },
        functionPayload: {
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
        },
        resultPath: 'DISCARD',
      });

      new sfn.StateMachine(this, 'StateMachine', {
        stateMachineName: props.stateMachineName,
        definition: sfn.Chain.start(getOrCreateConfigurationTask)
          .next(compareConfigurationsTask)
          .next(loadConfigurationTask)
          .next(addRoleToServiceCatalog)
          .next(createAccountsTask)
          .next(loadAccountsTask)
          .next(installRolesTask)
          .next(loadLimitsTask)
          .next(enableTrustedAccessForServicesTask)
          .next(deployPhase0Task)
          .next(storePhase0Output)
          .next(addScpTask)
          .next(deployPhase1Task)
          .next(storePhase1Output)
          .next(accountDefaultSettingsTask)
          .next(deployPhase2Task)
          .next(storePhase2Output)
          .next(deployPhase3Task)
          .next(storePhase3Output)
          .next(deployPhase4Task)
          .next(storePhase4Output)
          .next(associateHostedZonesTask)
          .next(addTagsToSharedResourcesTask)
          .next(enableDirectorySharingTask)
          .next(deployPhase5Task)
          .next(createAdConnectorTask)
          .next(storeCommitIdTask),
      });
    }
  }
}
