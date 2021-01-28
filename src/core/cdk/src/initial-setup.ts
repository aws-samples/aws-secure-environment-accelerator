import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3assets from '@aws-cdk/aws-s3-assets';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import { CdkDeployProject, PrebuiltCdkDeployProject } from '@aws-accelerator/cdk-accelerator/src/codebuild';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { createRoleName, createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';
import { CreateLandingZoneAccountTask } from './tasks/create-landing-zone-account-task';
import { CreateOrganizationAccountTask } from './tasks/create-organization-account-task';
import { CreateStackSetTask } from './tasks/create-stack-set-task';
import { CreateAdConnectorTask } from './tasks/create-adconnector-task';
import { BuildTask } from './tasks/build-task';
import { CreateStackTask } from './tasks/create-stack-task';
import { RunAcrossAccountsTask } from './tasks/run-across-accounts-task';
import * as fs from 'fs';
import * as sns from '@aws-cdk/aws-sns';
import { StoreOutputsTask } from './tasks/store-outputs-task';
import { StoreOutputsToSSMTask } from './tasks/store-outputs-to-ssm-task';

export namespace InitialSetup {
  export interface CommonProps {
    acceleratorPrefix: string;
    acceleratorName: string;
    solutionRoot: string;
    stateMachineName: string;
    stateMachineExecutionRole: string;
    configRepositoryName: string;
    configS3Bucket: string;
    configBranchName: string;
    notificationEmail: string;
    /**
     * Current Accelerator version
     */
    acceleratorVersion?: string;
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

      const lambdaPath = require.resolve('@aws-accelerator/accelerator-runtime');
      const lambdaDir = path.dirname(lambdaPath);
      const lambdaCode = lambda.Code.fromAsset(lambdaDir);

      const stack = cdk.Stack.of(this);

      const parametersTable = new dynamodb.Table(this, 'ParametersTable', {
        tableName: createName({
          name: 'Parameters',
          suffixLength: 0,
        }),
        partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      });

      const outputsTable = new dynamodb.Table(this, 'Outputs', {
        tableName: createName({
          name: 'Outputs',
          suffixLength: 0,
        }),
        partitionKey: {
          name: 'id',
          type: dynamodb.AttributeType.STRING,
        },
      });

      const outputUtilsTable = new dynamodb.Table(this, 'OutputUtils', {
        tableName: createName({
          name: 'Output-Utils',
          suffixLength: 0,
        }),
        partitionKey: {
          name: 'id',
          type: dynamodb.AttributeType.STRING,
        },
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
          new iam.ServicePrincipal('events.amazonaws.com'),
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
        commands: ['cd src/deployments/cdk', 'sh codebuild-deploy.sh'],
        timeout: buildTimeout,
        environment: {
          ACCELERATOR_NAME: props.acceleratorName,
          ACCELERATOR_PREFIX: props.acceleratorPrefix,
          ACCELERATOR_EXECUTION_ROLE_NAME: props.stateMachineExecutionRole,
          CDK_PLUGIN_ASSUME_ROLE_NAME: props.stateMachineExecutionRole,
          CDK_PLUGIN_ASSUME_ROLE_DURATION: `${buildTimeout.toSeconds()}`,
          ACCOUNTS_ITEM_ID: 'accounts',
          LIMITS_ITEM_ID: 'limits',
          ORGANIZATIONS_ITEM_ID: 'organizations',
          DYNAMODB_PARAMETERS_TABLE_NAME: parametersTable.tableName,
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
          s3Bucket: props.configS3Bucket,
          branchName: props.configBranchName,
          acceleratorVersion: props.acceleratorVersion!,
          'inputConfig.$': '$',
          'executionArn.$': '$$.Execution.Id',
          'stateMachineArn.$': '$$.StateMachine.Id',
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
          'baseline.$': '$.configuration.baselineOutput.baseline',
        },
        resultPath: 'DISCARD',
      });

      const getBaseLineTask = new CodeTask(this, 'Get Baseline From Configuration', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.getBaseline',
          role: pipelineRole,
        },
        functionPayload: {
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configuration.configFilePath',
          'configCommitId.$': '$.configuration.configCommitId',
          'acceleratorVersion.$': '$.configuration.acceleratorVersion',
          outputTableName: outputsTable.tableName,
          'storeAllOutputs.$': '$.configuration.storeAllOutputs',
        },
        resultPath: '$.configuration.baselineOutput',
      });

      const loadLandingZoneConfigurationTask = new CodeTask(this, 'Load Landing Zone Configuration', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.loadLandingZoneConfigurationStep',
          role: pipelineRole,
        },
        functionPayload: {
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configuration.configFilePath',
          'configCommitId.$': '$.configuration.configCommitId',
          'baseline.$': '$.configuration.baselineOutput.baseline',
          'storeAllOutputs.$': '$.configuration.baselineOutput.storeAllOutputs',
          'phases.$': '$.configuration.baselineOutput.phases',
          'acceleratorVersion.$': '$.configuration.acceleratorVersion',
          'configRootFilePath.$': '$.configuration.configRootFilePath',
          'organizationAdmiRole.$': '$.configuration.baselineOutput.organizationAdmiRole',
        },
        resultPath: '$.configuration',
      });

      const loadOrgConfigurationTask = new CodeTask(this, 'Load Organization Configuration', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.loadOrganizationConfigurationStep',
          role: pipelineRole,
        },
        functionPayload: {
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configuration.configFilePath',
          'configCommitId.$': '$.configuration.configCommitId',
          'baseline.$': '$.configuration.baselineOutput.baseline',
          'storeAllOutputs.$': '$.configuration.baselineOutput.storeAllOutputs',
          'phases.$': '$.configuration.baselineOutput.phases',
          'acceleratorVersion.$': '$.configuration.acceleratorVersion',
          'configRootFilePath.$': '$.configuration.configRootFilePath',
          'organizationAdmiRole.$': '$.configuration.baselineOutput.organizationAdmiRole',
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

      const createLandingZoneAccountStateMachine = new sfn.StateMachine(
        scope,
        `${props.acceleratorPrefix}ALZCreateAccount_sm`,
        {
          stateMachineName: `${props.acceleratorPrefix}ALZCreateAccount_sm`,
          definition: new CreateLandingZoneAccountTask(scope, 'Create ALZ Account', {
            lambdaCode,
            role: pipelineRole,
          }),
        },
      );

      const createLandingZoneAccountTask = new tasks.StepFunctionsStartExecution(this, 'Create Landing Zone Account', {
        stateMachine: createLandingZoneAccountStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          avmProductName,
          avmPortfolioName,
          'account.$': '$',
        }),
      });

      const createLandingZoneAccountsTask = new sfn.Map(this, 'Create Landing Zone Accounts', {
        itemsPath: '$.configuration.accounts',
        resultPath: 'DISCARD',
        maxConcurrency: 1,
      });

      createLandingZoneAccountsTask.iterator(createLandingZoneAccountTask);

      const createOrganizationAccountStateMachine = new sfn.StateMachine(
        scope,
        `${props.acceleratorPrefix}OrgCreateAccount_sm`,
        {
          stateMachineName: `${props.acceleratorPrefix}OrgCreateAccount_sm`,
          definition: new CreateOrganizationAccountTask(scope, 'Create Org Account', {
            lambdaCode,
            role: pipelineRole,
          }),
        },
      );

      const createOrganizationAccountsTask = new sfn.Map(this, 'Create Organization Accounts', {
        itemsPath: '$.configuration.accounts',
        resultPath: 'DISCARD',
        maxConcurrency: 1,
        parameters: {
          'account.$': '$$.Map.Item.Value',
          'organizationalUnits.$': '$.configuration.organizationalUnits',
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configuration.configFilePath',
          'configCommitId.$': '$.configuration.configCommitId',
          acceleratorPrefix: props.acceleratorPrefix,
        },
      });

      const createOrganizationAccountTask = new tasks.StepFunctionsStartExecution(this, 'Create Organization Account', {
        stateMachine: createOrganizationAccountStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          'createAccountConfiguration.$': '$',
        }),
      });

      createOrganizationAccountsTask.iterator(createOrganizationAccountTask);

      const loadOrganizationsTask = new CodeTask(this, 'Load Organizational Units', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.loadOrganizations',
          role: pipelineRole,
        },
        functionPayload: {
          parametersTableName: parametersTable.tableName,
          itemId: 'organizations',
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configuration.configFilePath',
          'configCommitId.$': '$.configuration.configCommitId',
        },
        resultPath: 'DISCARD',
      });

      const loadAccountsTask = new CodeTask(this, 'Load Accounts', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.loadAccountsStep',
          role: pipelineRole,
        },
        functionPayload: {
          parametersTableName: parametersTable.tableName,
          itemId: 'accounts',
          accountsItemsCountId: 'accounts-items-count',
          // Sending required Inputs seperately to omit unnecesary inputs from SM Input
          'configRepositoryName.$': '$.configuration.configRepositoryName',
          'configFilePath.$': '$.configuration.configFilePath',
          'configCommitId.$': '$.configuration.configCommitId',
          'acceleratorVersion.$': '$.configuration.acceleratorVersion',
          'baseline.$': '$.configuration.baseline',
          'phases.$': '$.configuration.phases',
          'storeAllOutputs.$': '$.configuration.storeAllOutputs',
          'regions.$': '$.configuration.regions',
          'accounts.$': '$.configuration.accounts',
          'configRootFilePath.$': '$.configuration.configRootFilePath',
          'organizationAdmiRole.$': '$.configuration.organizationAdmiRole',
        },
        resultPath: '$',
      });

      const installCfnRoleMasterTemplate = new s3assets.Asset(this, 'CloudFormationExecutionRoleTemplate', {
        path: path.join(__dirname, 'assets', 'cfn-execution-role-master.template.json'),
      });
      installCfnRoleMasterTemplate.bucket.grantRead(pipelineRole);

      const installCfnRoleMasterStateMachine = new sfn.StateMachine(
        this,
        `${props.acceleratorPrefix}InstallCloudFormationExecutionRoleMaster_sm`,
        {
          stateMachineName: `${props.acceleratorPrefix}InstallCfnRoleMaster_sm`,
          definition: new CreateStackTask(this, 'Install CloudFormation Execution Role', {
            lambdaCode,
            role: pipelineRole,
          }),
        },
      );

      const installCfnRoleMasterTask = new tasks.StepFunctionsStartExecution(
        this,
        'Install CloudFormation Role in Master',
        {
          stateMachine: installCfnRoleMasterStateMachine,
          integrationPattern: sfn.IntegrationPattern.RUN_JOB,
          input: sfn.TaskInput.fromObject({
            stackName: `${props.acceleratorPrefix}CloudFormationStackSetExecutionRole`,
            stackCapabilities: ['CAPABILITY_NAMED_IAM'],
            stackTemplate: {
              s3BucketName: installCfnRoleMasterTemplate.s3BucketName,
              s3ObjectKey: installCfnRoleMasterTemplate.s3ObjectKey,
            },
            stackParameters: {
              'RoleName.$': '$.configuration.organizationAdmiRole',
            },
          }),
          resultPath: 'DISCARD',
        },
      );

      const accountsPath = path.join(__dirname, 'assets', 'execution-role.template.json');
      const executionRoleContent = fs.readFileSync(accountsPath);

      const installRolesStateMachine = new sfn.StateMachine(this, `${props.acceleratorPrefix}InstallRoles_sm`, {
        stateMachineName: `${props.acceleratorPrefix}InstallRoles_sm`,
        definition: new CreateStackTask(this, 'Install', {
          lambdaCode,
          role: pipelineRole,
          suffix: 'ExecutionRole',
        }),
      });

      const installRolesTask = new tasks.StepFunctionsStartExecution(this, 'Install Execution Roles', {
        stateMachine: installRolesStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          stackName: `${props.acceleratorPrefix}PipelineRole`,
          stackCapabilities: ['CAPABILITY_NAMED_IAM'],
          stackParameters: {
            RoleName: props.stateMachineExecutionRole,
            MaxSessionDuration: `${buildTimeout.toSeconds()}`,
            // TODO Only add root role for development environments
            AssumedByRoleArn: `arn:aws:iam::${stack.account}:root,${pipelineRole.roleArn}`,
          },
          stackTemplate: executionRoleContent.toString(),
          'accountId.$': '$.accountId',
          'assumedRoleName.$': '$.organizationAdmiRole',
        }),
        resultPath: 'DISCARD',
      });

      const installExecRolesInAccounts = new sfn.Map(this, `Install Execution Roles Map`, {
        itemsPath: '$.accounts',
        resultPath: 'DISCARD',
        maxConcurrency: 40,
        parameters: {
          'accountId.$': '$$.Map.Item.Value',
          'organizationAdmiRole.$': '$.organizationAdmiRole',
        },
      });

      installExecRolesInAccounts.iterator(installRolesTask);

      const deleteVpcSfn = new sfn.StateMachine(this, 'Delete Default Vpcs Sfn', {
        stateMachineName: `${props.acceleratorPrefix}DeleteDefaultVpcs_sfn`,
        definition: new RunAcrossAccountsTask(this, 'DeleteDefaultVPCs', {
          lambdaCode,
          role: pipelineRole,
          assumeRoleName: props.stateMachineExecutionRole,
          lambdaPath: 'index.deleteDefaultVpcs',
          name: 'Delete Default VPC',
        }),
      });

      const deleteVpcTask = new tasks.StepFunctionsStartExecution(this, 'Delete Default Vpcs', {
        stateMachine: deleteVpcSfn,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          'accounts.$': '$.accounts',
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          'baseline.$': '$.baseline',
          acceleratorPrefix: props.acceleratorPrefix,
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
          parametersTableName: parametersTable.tableName,
          itemId: 'limits',
          assumeRoleName: props.stateMachineExecutionRole,
        },
        resultPath: '$.limits',
      });

      const validateOuConfiguration = new CodeTask(this, 'OU Validation', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.ouValidation',
          role: pipelineRole,
        },
        functionPayload: {
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configuration.configFilePath',
          'configCommitId.$': '$.configuration.configCommitId',
          acceleratorPrefix: props.acceleratorPrefix,
          parametersTableName: parametersTable.tableName,
          organizationsItemId: 'organizations',
          accountsItemId: 'accounts',
          configBranch: props.configBranchName,
          'configRootFilePath.$': '$.configuration.configRootFilePath',
        },
        resultPath: '$.configuration.configCommitId',
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
          parametersTableName: parametersTable.tableName,
          outputTableName: outputsTable.tableName,
        },
        resultPath: 'DISCARD',
      });

      const storeOutputsToSsmStateMachine = new sfn.StateMachine(
        this,
        `${props.acceleratorPrefix}StoreOutputsToSsm_sm`,
        {
          stateMachineName: `${props.acceleratorPrefix}StoreOutputsToSsm_sm`,
          definition: new StoreOutputsToSSMTask(this, 'StoreOutputsToSSM', {
            lambdaCode,
            role: pipelineRole,
          }),
        },
      );

      const storeAllOutputsToSsmTask = new tasks.StepFunctionsStartExecution(this, 'Store Outputs to SSM', {
        stateMachine: storeOutputsToSsmStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          'accounts.$': '$.accounts',
          'regions.$': '$.regions',
          acceleratorPrefix: props.acceleratorPrefix,
          assumeRoleName: props.stateMachineExecutionRole,
          outputsTableName: outputsTable.tableName,
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          outputUtilsTableName: outputUtilsTable.tableName,
          accountsTableName: parametersTable.tableName,
        }),
        resultPath: 'DISCARD',
      });

      const detachQuarantineScpTask = new CodeTask(this, 'Detach Quarantine SCP', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.detachQuarantineScp',
          role: pipelineRole,
        },
        functionPayload: {
          acceleratorPrefix: props.acceleratorPrefix,
          parametersTableName: parametersTable.tableName,
        },
        resultPath: 'DISCARD',
      });
      detachQuarantineScpTask.next(storeAllOutputsToSsmTask);

      const enableTrustedAccessForServicesTask = new CodeTask(this, 'Enable Trusted Access For Services', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.enableTrustedAccessForServicesStep',
          role: pipelineRole,
        },
        functionPayload: {
          parametersTableName: parametersTable.tableName,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
        },
        resultPath: '$.installerVersion',
      });

      const codeBuildStateMachine = new sfn.StateMachine(this, `${props.acceleratorPrefix}CodeBuild_sm`, {
        stateMachineName: `${props.acceleratorPrefix}CodeBuild_sm`,
        definition: new BuildTask(this, 'CodeBuild', {
          lambdaCode,
          role: pipelineRole,
        }),
      });

      // TODO Move this to a separate state machine, including store output task
      const createDeploymentTask = (phase: number, loadOutputs: boolean = true) => {
        const environment: { [name: string]: string } = {
          ACCELERATOR_PHASE: `${phase}`,
          'CONFIG_REPOSITORY_NAME.$': '$.configRepositoryName',
          'CONFIG_FILE_PATH.$': '$.configFilePath',
          'CONFIG_COMMIT_ID.$': '$.configCommitId',
          'ACCELERATOR_BASELINE.$': '$.baseline',
          'CONFIG_ROOT_FILE_PATH.$': '$.configRootFilePath',
          'INSTALLER_VERSION.$': '$.installerVersion',
          ACCELERATOR_PIPELINE_ROLE_NAME: pipelineRole.roleName,
          ACCELERATOR_STATE_MACHINE_NAME: props.stateMachineName,
          CONFIG_BRANCH_NAME: props.configBranchName,
          STACK_OUTPUT_TABLE_NAME: outputsTable.tableName,
        };

        const deployTask = new tasks.StepFunctionsStartExecution(this, `Deploy Phase ${phase}`, {
          stateMachine: codeBuildStateMachine,
          integrationPattern: sfn.IntegrationPattern.RUN_JOB,
          input: sfn.TaskInput.fromObject({
            codeBuildProjectName: project.projectName,
            environment,
          }),
          resultPath: 'DISCARD',
        });
        return deployTask;
      };

      const storeOutputsStateMachine = new sfn.StateMachine(this, `${props.acceleratorPrefix}StoreOutputs_sm`, {
        stateMachineName: `${props.acceleratorPrefix}StoreOutputs_sm`,
        definition: new StoreOutputsTask(this, 'StoreOutputs', {
          lambdaCode,
          role: pipelineRole,
        }),
      });

      const createStoreOutputTask = (phase: number) => {
        const storeOutputsTask = new tasks.StepFunctionsStartExecution(this, `Store Phase ${phase} Outputs`, {
          stateMachine: storeOutputsStateMachine,
          integrationPattern: sfn.IntegrationPattern.RUN_JOB,
          input: sfn.TaskInput.fromObject({
            'accounts.$': '$.accounts',
            'regions.$': '$.regions',
            acceleratorPrefix: props.acceleratorPrefix,
            assumeRoleName: props.stateMachineExecutionRole,
            outputsTable: outputsTable.tableName,
            phaseNumber: phase,
            configRepositoryName: props.configRepositoryName,
            'configFilePath.$': '$.configFilePath',
            'configCommitId.$': '$.configCommitId',
          }),
          resultPath: 'DISCARD',
        });
        return storeOutputsTask;
      };

      const storeAllPhaseOutputs = new sfn.Map(this, `Store All Phase Outputs Map`, {
        itemsPath: '$.phases',
        resultPath: 'DISCARD',
        maxConcurrency: 1,
        parameters: {
          'accounts.$': '$.accounts',
          'regions.$': '$.regions',
          acceleratorPrefix: props.acceleratorPrefix,
          assumeRoleName: props.stateMachineExecutionRole,
          outputsTable: outputsTable.tableName,
          configRepositoryName: props.configRepositoryName,
          'phaseNumber.$': '$$.Map.Item.Value',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
        },
      });

      const storeAllOutputsTask = new tasks.StepFunctionsStartExecution(this, `Store All Phase Outputs`, {
        stateMachine: storeOutputsStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          'accounts.$': '$.accounts',
          'regions.$': '$.regions',
          acceleratorPrefix: props.acceleratorPrefix,
          assumeRoleName: props.stateMachineExecutionRole,
          outputsTable: outputsTable.tableName,
          configRepositoryName: props.configRepositoryName,
          'phaseNumber.$': '$.phaseNumber',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
        }),
        resultPath: 'DISCARD',
      });
      storeAllPhaseOutputs.iterator(storeAllOutputsTask);

      // TODO Create separate state machine for deployment
      const deployPhaseRolesTask = createDeploymentTask(-1, false);
      const storePreviousOutput = createStoreOutputTask(-1);
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

      const createConfigRecorderSfn = new sfn.StateMachine(this, 'Create Config Recorder Sfn', {
        stateMachineName: `${props.acceleratorPrefix}CreateConfigRecorder_sfn`,
        definition: new RunAcrossAccountsTask(this, 'CreateConfigRecorder', {
          lambdaCode,
          role: pipelineRole,
          assumeRoleName: props.stateMachineExecutionRole,
          lambdaPath: 'index.createConfigRecorder',
          name: 'Create Config Recorder',
          functionPayload: {
            outputTableName: outputsTable.tableName,
          },
        }),
      });

      const createConfigRecordersTask = new tasks.StepFunctionsStartExecution(this, 'Create Config Recorders', {
        stateMachine: createConfigRecorderSfn,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          'accounts.$': '$.accounts',
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          'baseline.$': '$.baseline',
          outputTableName: outputsTable.tableName,
          acceleratorPrefix: props.acceleratorPrefix,
        }),
        resultPath: 'DISCARD',
      });

      // TODO We could put this task in a map task and apply to all accounts individually
      const accountDefaultSettingsTask = new CodeTask(this, 'Account Default Settings', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.accountDefaultSettingsStep',
          role: pipelineRole,
        },
        functionPayload: {
          assumeRoleName: props.stateMachineExecutionRole,
          parametersTableName: parametersTable.tableName,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          outputTableName: outputsTable.tableName,
        },
        resultPath: 'DISCARD',
      });

      const rdgwArtifactsFolderPath = path.join(__dirname, '..', '..', '..', '..', 'reference-artifacts', 'scripts');
      const rdgwScripts = fs.readdirSync(rdgwArtifactsFolderPath);

      const verifyFilesTask = new CodeTask(this, 'Verify Files', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.verifyFilesStep',
          role: pipelineRole,
        },
        functionPayload: {
          assumeRoleName: props.stateMachineExecutionRole,
          parametersTableName: parametersTable.tableName,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          outputTableName: outputsTable.tableName,
          rdgwScripts,
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
          outputTableName: outputsTable.tableName,
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
          parametersTableName: parametersTable.tableName,
          assumeRoleName: props.stateMachineExecutionRole,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          outputTableName: outputsTable.tableName,
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

      const createAdConnectorTask = new tasks.StepFunctionsStartExecution(this, 'Create AD Connector', {
        stateMachine: createAdConnectorStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          acceleratorPrefix: props.acceleratorPrefix,
          parametersTableName: parametersTable.tableName,
          assumeRoleName: props.stateMachineExecutionRole,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          outputTableName: outputsTable.tableName,
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

      const baseLineCleanupChoice = new sfn.Choice(this, 'Baseline Clean Up?')
        .when(sfn.Condition.stringEquals('$.baseline', 'ORGANIZATIONS'), detachQuarantineScpTask)
        .otherwise(storeAllOutputsToSsmTask);

      const commonStep1 = addScpTask.startState
        .next(deployPhase1Task)
        .next(storePhase1Output)
        .next(accountDefaultSettingsTask)
        .next(deployPhase2Task)
        .next(storePhase2Output)
        .next(deployPhase3Task)
        .next(storePhase3Output)
        .next(deployPhase4Task)
        .next(storePhase4Output)
        .next(addTagsToSharedResourcesTask)
        .next(enableDirectorySharingTask)
        .next(deployPhase5Task)
        .next(createAdConnectorTask)
        .next(storeCommitIdTask)
        .next(baseLineCleanupChoice);

      const enableConfigChoice = new sfn.Choice(this, 'Create Config Recorders?')
        .when(sfn.Condition.stringEquals('$.baseline', 'ORGANIZATIONS'), createConfigRecordersTask.next(commonStep1))
        .otherwise(commonStep1)
        .afterwards();

      const commonStep2 = deployPhaseRolesTask
        .next(storePreviousOutput)
        .next(deployPhase0Task)
        .next(storePhase0Output)
        .next(verifyFilesTask)
        .next(enableConfigChoice);

      const storeAllOutputsChoice = new sfn.Choice(this, 'Store All Phase Outputs?')
        .when(sfn.Condition.booleanEquals('$.storeAllOutputs', true), storeAllPhaseOutputs.next(commonStep2))
        .otherwise(commonStep2)
        .afterwards();

      const commonDefinition = loadOrganizationsTask.startState
        .next(loadAccountsTask)
        .next(installExecRolesInAccounts)
        .next(deleteVpcTask)
        .next(loadLimitsTask)
        .next(enableTrustedAccessForServicesTask)
        .next(storeAllOutputsChoice);

      // Landing Zone Config Setup
      const alzConfigDefinition = loadLandingZoneConfigurationTask.startState
        .next(addRoleToServiceCatalog)
        .next(createLandingZoneAccountsTask)
        .next(commonDefinition);

      const cloudFormationMasterRoleChoice = new sfn.Choice(this, 'Install CloudFormation Role in Master?')
        .when(
          sfn.Condition.booleanEquals('$.configuration.installCloudFormationMasterRole', true),
          installCfnRoleMasterTask,
        )
        .otherwise(createOrganizationAccountsTask)
        .afterwards();

      installCfnRoleMasterTask.next(createOrganizationAccountsTask).next(commonDefinition);

      // // Organizations Config Setup
      const orgConfigDefinition = validateOuConfiguration.startState
        .next(loadOrgConfigurationTask)
        .next(cloudFormationMasterRoleChoice);

      const baseLineChoice = new sfn.Choice(this, 'Baseline?')
        .when(
          sfn.Condition.stringEquals('$.configuration.baselineOutput.baseline', 'LANDING_ZONE'),
          alzConfigDefinition,
        )
        .when(
          sfn.Condition.stringEquals('$.configuration.baselineOutput.baseline', 'ORGANIZATIONS'),
          orgConfigDefinition,
        )
        .otherwise(
          new sfn.Fail(this, 'Fail', {
            cause: 'Invalid Baseline supplied',
          }),
        )
        .afterwards();

      const notificationTopic = new sns.Topic(this, 'MainStateMachineStatusTopic', {
        displayName: `${props.acceleratorPrefix}-MainStateMachine-Status_topic`,
        topicName: `${props.acceleratorPrefix}-MainStateMachine-Status_topic`,
      });

      new sns.Subscription(this, 'MainStateMachineStatusTopicSubscription', {
        topic: notificationTopic,
        protocol: sns.SubscriptionProtocol.EMAIL,
        endpoint: props.notificationEmail,
      });

      const fail = new sfn.Fail(this, 'Failed');

      const notifySmFailure = new CodeTask(this, 'Execution Failed', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.notifySMFailure',
          role: pipelineRole,
        },
        functionPayload: {
          notificationTopicArn: notificationTopic.topicArn,
          'error.$': '$.Error',
          'cause.$': '$.Cause',
          'executionId.$': '$$.Execution.Id',
          acceleratorVersion: props.acceleratorVersion,
        },
        resultPath: 'DISCARD',
      });
      notifySmFailure.next(fail);

      const notifySmSuccess = new CodeTask(this, 'Deploy Success', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.notifySMSuccess',
          role: pipelineRole,
        },
        functionPayload: {
          notificationTopicArn: notificationTopic.topicArn,
          parametersTableName: parametersTable.tableName,
          'acceleratorVersion.$': '$[0].acceleratorVersion',
        },
        resultPath: 'DISCARD',
      });

      // Full StateMachine Execution starts from getOrCreateConfigurationTask and wrapped in parallel task for try/catch
      getOrCreateConfigurationTask.next(getBaseLineTask).next(compareConfigurationsTask).next(baseLineChoice);

      const mainTryCatch = new sfn.Parallel(this, 'Main Try Catch block to Notify users');
      mainTryCatch.branch(getOrCreateConfigurationTask);
      mainTryCatch.addCatch(notifySmFailure);
      mainTryCatch.next(notifySmSuccess);

      new sfn.StateMachine(this, 'StateMachine', {
        stateMachineName: props.stateMachineName,
        definition: sfn.Chain.start(mainTryCatch),
      });
    }
  }
}

function setSecretValue(secret: secrets.Secret, value: string) {
  const cfnSecret = secret.node.defaultChild as secrets.CfnSecret;
  cfnSecret.addPropertyOverride('SecretString', value);
  cfnSecret.addPropertyDeletionOverride('GenerateSecretString');
}
