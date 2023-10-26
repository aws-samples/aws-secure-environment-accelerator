/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CdkDeployProject, PrebuiltCdkDeployProject } from '@aws-accelerator/cdk-accelerator/src/codebuild';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { createName, createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';

import { AddTagsToResourcesTask } from './tasks/add-tags-to-resources-task';
import { CDKBootstrapTask } from './tasks/cdk-bootstrap';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';
import { CreateAdConnectorTask } from './tasks/create-adconnector-task';
import { CreateControlTowerAccountTask } from './tasks/create-control-tower-account-task';
import { CreateOrganizationAccountTask } from './tasks/create-organization-account-task';
import { CreateStackTask } from './tasks/create-stack-task';
import { RunAcrossAccountsTask } from './tasks/run-across-accounts-task';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as sns from 'aws-cdk-lib/aws-sns';
import { StoreOutputsTask } from './tasks/store-outputs-task';
import { StoreOutputsToSSMTask } from './tasks/store-outputs-to-ssm-task';
import * as kms from 'aws-cdk-lib/aws-kms';

const VPC_CIDR_POOL_TABLE = 'cidr-vpc-assign';
const SUBNET_CIDR_POOL_TABLE = 'cidr-subnet-assign';
const CIDR_POOL_TABLE = 'cidr-pool';

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
    installerCmk: string;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    codebuildComputeType: any;
    pageSize: string;
    backoff: string | undefined;
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
  constructor(scope: Construct, id: string, props: InitialSetup.Props) {
    super(scope, id, props);

    new InitialSetup.Pipeline(this, 'Pipeline', props);
  }
}

export namespace InitialSetup {
  export type PipelineProps = CommonProps;

  export class Pipeline extends Construct {
    constructor(scope: Construct, id: string, props: PipelineProps) {
      super(scope, id);

      const { enablePrebuiltProject } = props;
      const bootStrapStackName = `${props.acceleratorPrefix}CDKToolkit`;

      const lambdaPath = require.resolve('@aws-accelerator/accelerator-runtime');
      const lambdaDir = path.dirname(lambdaPath);
      const lambdaCode = lambda.Code.fromAsset(lambdaDir);

      const stack = cdk.Stack.of(this);
      const installerCmk = kms.Alias.fromAliasName(this, 'InstallerCmk', props.installerCmk);
      const parametersTable = new dynamodb.Table(this, 'ParametersTable', {
        tableName: createName({
          name: 'Parameters',
          suffixLength: 0,
        }),
        partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
        encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: installerCmk,
        pointInTimeRecovery: true,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
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
        encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: installerCmk,
        pointInTimeRecovery: true,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
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
        encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: installerCmk,
        pointInTimeRecovery: true,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      });

      // Tables required for VPC Cidr mappings for VPC, Account and OU
      const vpcCidrPoolTable = new dynamodb.Table(this, 'CidrVpcAssign', {
        tableName: createName({
          name: VPC_CIDR_POOL_TABLE,
          suffixLength: 0,
        }),
        partitionKey: {
          name: 'id',
          type: dynamodb.AttributeType.STRING,
        },
        encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: installerCmk,
        pointInTimeRecovery: true,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      });

      const subnetCidrPoolTable = new dynamodb.Table(this, 'CidrSubnetAssign', {
        tableName: createName({
          name: SUBNET_CIDR_POOL_TABLE,
          suffixLength: 0,
        }),
        partitionKey: {
          name: 'id',
          type: dynamodb.AttributeType.STRING,
        },
        encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: installerCmk,
        pointInTimeRecovery: true,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      });

      const cidrPoolTable = new dynamodb.Table(this, 'CidrPoolTable', {
        tableName: createName({
          name: CIDR_POOL_TABLE,
          suffixLength: 0,
        }),
        partitionKey: {
          name: 'id',
          type: dynamodb.AttributeType.STRING,
        },
        encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: installerCmk,
        pointInTimeRecovery: true,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      });

      // This is the maximum time before a build times out
      // The role used by the build should allow this session duration
      const buildTimeout = cdk.Duration.hours(4);
      const roleName = createRoleName('L-SFN-MasterRole');
      const roleArn = `arn:${stack.partition}:iam::${stack.account}:role/${roleName}`;

      // The pipeline stage `InstallRoles` will allow the pipeline role to assume a role in the sub accounts
      const pipelineRole = new iam.Role(this, 'Role', {
        roleName,
        assumedBy: new iam.CompositePrincipal(
          // TODO Only add root role for development environments
          new iam.ServicePrincipal('codebuild.amazonaws.com'),
          new iam.ServicePrincipal('lambda.amazonaws.com'),
          new iam.ServicePrincipal('events.amazonaws.com'),
        ),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
        maxSessionDuration: buildTimeout,
      });

      pipelineRole.assumeRolePolicy?.addStatements(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.AccountPrincipal(stack.account)],
          actions: ['sts:AssumeRole'],
          conditions: {
            ArnLike: {
              'aws:PrincipalARN': `arn:aws:iam::${stack.account}:role/${roleName}`,
            },
          },
        }),
      );

      // S3 working bucket
      const s3WorkingBucket = new s3.Bucket(this, 'WorkingBucket', {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        lifecycleRules: [
          {
            id: '7DaysDelete',
            enabled: true,
            expiration: cdk.Duration.days(7),
          },
        ],
      });
      s3WorkingBucket.addToResourcePolicy(
        new iam.PolicyStatement({
          actions: ['s3:GetObject*', 's3:PutObject*', 's3:DeleteObject*', 's3:GetBucket*', 's3:List*'],
          resources: [s3WorkingBucket.arnForObjects('*'), s3WorkingBucket.bucketArn],
          principals: [pipelineRole],
        }),
      );
      // Allow only https requests
      s3WorkingBucket.addToResourcePolicy(
        new iam.PolicyStatement({
          actions: ['s3:*'],
          resources: [s3WorkingBucket.bucketArn, s3WorkingBucket.arnForObjects('*')],
          principals: [new iam.AnyPrincipal()],
          conditions: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
          effect: iam.Effect.DENY,
        }),
      );
      //

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
        computeType: props.codebuildComputeType,
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
          VPC_CIDR_ASSIGNED_POOL: vpcCidrPoolTable.tableName,
          SUBNET_CIDR_ASSIGNED_POOL: subnetCidrPoolTable.tableName,
          CIDR_POOL: cidrPoolTable.tableName,
          DEPLOY_STACK_PAGE_SIZE: props.pageSize,
          COMPUTE_TYPE: props.codebuildComputeType,
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
          'smInput.$': '$',
          acceleratorPrefix: props.acceleratorPrefix,
          acceleratorName: props.acceleratorName,
          region: cdk.Aws.REGION,
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
          'inputConfig.$': '$.configuration.smInput',
          region: cdk.Aws.REGION,
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configuration.configFilePath',
          'configCommitId.$': '$.configuration.configCommitId',
          'acceleratorVersion.$': '$.configuration.acceleratorVersion',
          'baseline.$': '$.configuration.baselineOutput.baseline',
          parametersTableName: parametersTable.tableName,
          vpcCidrPoolAssignedTable: vpcCidrPoolTable.tableName,
          subnetCidrPoolAssignedTable: subnetCidrPoolTable.tableName,
          outputTableName: outputsTable.tableName,
        },
        resultPath: sfn.JsonPath.DISCARD,
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
          vpcCidrPoolAssignedTable: vpcCidrPoolTable.tableName,
          subnetCidrPoolAssignedTable: subnetCidrPoolTable.tableName,
          cidrPoolsTable: cidrPoolTable.tableName,
        },
        resultPath: '$.configuration.baselineOutput',
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
          'organizationAdminRole.$': '$.configuration.baselineOutput.organizationAdminRole',
          'smInput.$': '$.configuration.smInput',
          acceleratorPrefix: props.acceleratorPrefix,
          parametersTableName: parametersTable.tableName,
        },
        resultPath: '$.configuration',
      });

      // TODO We might want to load this from the Control Tower api
      const avmProductName = 'AWS Control Tower Account Factory';
      const avmPortfolioName = 'AWS Control Tower Account Factory Portfolio';

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
        resultPath: sfn.JsonPath.DISCARD,
      });

      const createControlTowerAccountStateMachine = new sfn.StateMachine(
        scope,
        `${props.acceleratorPrefix}CTCreateAccount_sm`,
        {
          stateMachineName: `${props.acceleratorPrefix}CTCreateAccount_sm`,
          definition: new CreateControlTowerAccountTask(scope, 'Create CT Account', {
            lambdaCode,
            role: pipelineRole,
          }),
        },
      );

      const createControlTowerAccountTask = new tasks.StepFunctionsStartExecution(this, 'Create Account', {
        stateMachine: createControlTowerAccountStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          avmProductName,
          avmPortfolioName,
          'account.$': '$',
        }),
      });

      const createControlTowerAccountsTask = new sfn.Map(this, 'Create Accounts', {
        itemsPath: '$.configuration.accounts',
        resultPath: sfn.JsonPath.DISCARD,
        maxConcurrency: 1,
      });

      createControlTowerAccountsTask.iterator(createControlTowerAccountTask);

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
        resultPath: sfn.JsonPath.DISCARD,
        maxConcurrency: 1,
        parameters: {
          'account.$': '$$.Map.Item.Value',
          'organizationalUnits.$': '$.configuration.organizationalUnits',
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configuration.configFilePath',
          'configCommitId.$': '$.configuration.configCommitId',
          acceleratorPrefix: props.acceleratorPrefix,
          acceleratorName: props.acceleratorName,
          region: cdk.Aws.REGION,
          'organizationAdminRole.$': '$.configuration.organizationAdminRole',
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
        resultPath: sfn.JsonPath.DISCARD,
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
          'organizationAdminRole.$': '$.configuration.organizationAdminRole',
          'smInput.$': '$.configuration.smInput',
        },
        resultPath: '$',
      });

      const bootstrapOperationsTemplate = new s3assets.Asset(this, 'CloudFormationOperationsBootstrapTemplate', {
        path: path.join(__dirname, 'assets', 'operations-cdk-bucket.yml'),
      });

      const bootstrapAccountTemplate = new s3assets.Asset(this, 'CloudFormationBootstrapTemplate', {
        path: path.join(__dirname, 'assets', 'account-cdk-bootstrap.yml'),
      });

      const cdkBootstrapStateMachine = new sfn.StateMachine(this, `${props.acceleratorPrefix}CDKBootstrap_sm`, {
        stateMachineName: `${props.acceleratorPrefix}CDKBootstrap_sm`,
        definition: new CDKBootstrapTask(this, 'CDKBootstrap', {
          lambdaCode,
          role: pipelineRole,
          acceleratorPrefix: props.acceleratorPrefix,
          operationsBootstrapObjectKey: bootstrapOperationsTemplate.s3ObjectKey,
          s3BucketName: bootstrapOperationsTemplate.s3BucketName,
          assumeRoleName: props.stateMachineExecutionRole,
          accountBootstrapObjectKey: bootstrapAccountTemplate.s3ObjectKey,
          bootStrapStackName,
        }),
      });

      const cdkBootstrapTask = new tasks.StepFunctionsStartExecution(this, 'Bootstrap Environment', {
        stateMachine: cdkBootstrapStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          'accounts.$': '$.accounts',
          'regions.$': '$.regions',
          accountsTableName: parametersTable.tableName,
          configRepositoryName: props.configRepositoryName,
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
        }),
        resultPath: sfn.JsonPath.DISCARD,
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
              'RoleName.$': '$.configuration.organizationAdminRole',
            },
          }),
          resultPath: sfn.JsonPath.DISCARD,
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
            AcceleratorPrefix: props.acceleratorPrefix.endsWith('-')
              ? props.acceleratorPrefix.slice(0, -1).toLowerCase()
              : props.acceleratorPrefix.toLowerCase(),
          },
          stackTemplate: executionRoleContent.toString(),
          'accountId.$': '$.accountId',
          'assumeRoleName.$': '$.organizationAdminRole',
        }),
        resultPath: sfn.JsonPath.DISCARD,
      });

      const installExecRolesInAccounts = new sfn.Map(this, `Install Execution Roles Map`, {
        itemsPath: '$.accounts',
        resultPath: sfn.JsonPath.DISCARD,
        maxConcurrency: 40,
        parameters: {
          'accountId.$': '$$.Map.Item.Value',
          'organizationAdminRole.$': '$.organizationAdminRole',
        },
      });

      installExecRolesInAccounts.iterator(installRolesTask);

      const deleteVpcSfn = new sfn.StateMachine(this, 'Delete Default Vpcs Sfn', {
        stateMachineName: `${props.acceleratorPrefix}DeleteDefaultVpcs_sfn`,
        definition: new RunAcrossAccountsTask(this, 'DeleteDefaultVPCs', {
          lambdaCode,
          role: pipelineRole,
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
          assumeRoleName: props.stateMachineExecutionRole,
        }),
        resultPath: sfn.JsonPath.DISCARD,
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
          'baseline.$': '$.configuration.baselineOutput.baseline',
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
          acceleratorName: props.acceleratorName,
          region: cdk.Aws.REGION,
          'configRepositoryName.$': '$.configRepositoryName',
          'configFilePath.$': '$.configFilePath',
          'configCommitId.$': '$.configCommitId',
          parametersTableName: parametersTable.tableName,
          outputTableName: outputsTable.tableName,
          'organizationAdminRole.$': '$.organizationAdminRole',
          'baseline.$': '$.baseline',
        },
        resultPath: sfn.JsonPath.DISCARD,
      });

      const storeOutputsToSsmStateMachine = new sfn.StateMachine(
        this,
        `${props.acceleratorPrefix}StoreOutputsToSsm_sm`,
        {
          stateMachineName: `${props.acceleratorPrefix}StoreOutputsToSsm_sm`,
          definition: new StoreOutputsToSSMTask(this, 'StoreOutputsToSSM', {
            acceleratorPrefix: props.acceleratorPrefix,
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
          s3WorkingBucket: s3WorkingBucket.bucketName,
        }),
        resultPath: sfn.JsonPath.DISCARD,
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
        resultPath: sfn.JsonPath.DISCARD,
      });
      // detachQuarantineScpTask.next(storeAllOutputsToSsmTask);

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

      const createDeploymentTask = (phase: number, loadOutputs: boolean = true) => {
        const environment = {
          ACCELERATOR_PHASE: { type: codebuild.BuildEnvironmentVariableType.PLAINTEXT, value: `${phase}` },
          CONFIG_REPOSITORY_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: sfn.JsonPath.stringAt('$.configRepositoryName'),
          },
          CONFIG_FILE_PATH: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: sfn.JsonPath.stringAt('$.configFilePath'),
          },
          CONFIG_COMMIT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: sfn.JsonPath.stringAt('$.configCommitId'),
          },
          ACCELERATOR_BASELINE: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: sfn.JsonPath.stringAt('$.baseline'),
          },
          CONFIG_ROOT_FILE_PATH: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: sfn.JsonPath.stringAt('$.configRootFilePath'),
          },
          INSTALLER_VERSION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: sfn.JsonPath.stringAt('$.installerVersion'),
          },
          ACCELERATOR_PIPELINE_ROLE_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: pipelineRole.roleName,
          },
          ACCELERATOR_STATE_MACHINE_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.stateMachineName,
          },
          CONFIG_BRANCH_NAME: { type: codebuild.BuildEnvironmentVariableType.PLAINTEXT, value: props.configBranchName },
          STACK_OUTPUT_TABLE_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: outputsTable.tableName,
          },
          BOOTSTRAP_STACK_NAME: { type: codebuild.BuildEnvironmentVariableType.PLAINTEXT, value: bootStrapStackName },
          SCOPE: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: sfn.JsonPath.stringAt('$.scope'),
          },
          MODE: { type: codebuild.BuildEnvironmentVariableType.PLAINTEXT, value: sfn.JsonPath.stringAt('$.mode') },
          CDK_DEBUG: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: sfn.JsonPath.stringAt('$.verbose'),
          },
        };

        const deployTask = new tasks.CodeBuildStartBuild(this, `Deploy Phase ${phase}`, {
          project: project.resource,
          integrationPattern: sfn.IntegrationPattern.RUN_JOB,
          environmentVariablesOverride: environment,
          resultPath: sfn.JsonPath.DISCARD,
        });

        return deployTask;
      };

      const storeOutputsStateMachine = new sfn.StateMachine(this, `${props.acceleratorPrefix}StoreOutputs_sm`, {
        stateMachineName: `${props.acceleratorPrefix}StoreOutputs_sm`,
        definition: new StoreOutputsTask(this, 'StoreOutputs', {
          acceleratorPrefix: props.acceleratorPrefix,
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
          resultPath: sfn.JsonPath.DISCARD,
        });
        return storeOutputsTask;
      };

      const storeAllPhaseOutputs = new sfn.Map(this, `Store All Phase Outputs Map`, {
        itemsPath: '$.phases',
        resultPath: sfn.JsonPath.DISCARD,
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
        resultPath: sfn.JsonPath.DISCARD,
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
      const storePhase5Output = createStoreOutputTask(5);

      const createConfigRecorderSfn = new sfn.StateMachine(this, 'Create Config Recorder Sfn', {
        stateMachineName: `${props.acceleratorPrefix}CreateConfigRecorder_sfn`,
        definition: new RunAcrossAccountsTask(this, 'CreateConfigRecorder', {
          lambdaCode,
          role: pipelineRole,
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
          assumeRoleName: props.stateMachineExecutionRole,
        }),
        resultPath: sfn.JsonPath.DISCARD,
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
          'baseline.$': '$.baseline',
          outputTableName: outputsTable.tableName,
        },
        resultPath: sfn.JsonPath.DISCARD,
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
        resultPath: sfn.JsonPath.DISCARD,
      });

      // S3 bucket for Add Tags to Shared Resources Lambda fns
      const addTagsToSharedResourcesBucket = new s3.Bucket(this, 'AddTagsToSharedResourcesBucket', {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        lifecycleRules: [
          {
            id: '1DayDelete',
            enabled: true,
            expiration: cdk.Duration.days(1),
          },
        ],
      });
      addTagsToSharedResourcesBucket.addToResourcePolicy(
        new iam.PolicyStatement({
          actions: ['s3:GetObject*', 's3:PutObject*', 's3:DeleteObject*', 's3:GetBucket*', 's3:List*'],
          resources: [addTagsToSharedResourcesBucket.arnForObjects('*'), addTagsToSharedResourcesBucket.bucketArn],
          principals: [pipelineRole],
        }),
      );
      // Allow only https requests
      addTagsToSharedResourcesBucket.addToResourcePolicy(
        new iam.PolicyStatement({
          actions: ['s3:*'],
          resources: [addTagsToSharedResourcesBucket.bucketArn, addTagsToSharedResourcesBucket.arnForObjects('*')],
          principals: [new iam.AnyPrincipal()],
          conditions: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
          effect: iam.Effect.DENY,
        }),
      );

      // State Machine and associated resources for Adding Tags to Shared Resources
      const addTagsToSharedResourcesStateMachine = new sfn.StateMachine(this, 'Add Tags To Resources Sfn', {
        stateMachineName: `${props.acceleratorPrefix}AddTagsToSharedResources_sfn`,
        definition: new AddTagsToResourcesTask(this, 'AddTagsToSharedResources', {
          lambdaCode,
          role: pipelineRole,
          name: 'Add Tags To Shared Resources',
        }),
      });

      const addTagsToSharedResourcesTask = new tasks.StepFunctionsStartExecution(this, 'Add Tags To Resources', {
        stateMachine: addTagsToSharedResourcesStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
          'accounts.$': '$.accounts',
          acceleratorPrefix: props.acceleratorPrefix,
          assumeRoleName: props.stateMachineExecutionRole,
          outputTableName: outputsTable.tableName,
          s3Bucket: addTagsToSharedResourcesBucket.bucketName,
        }),
        resultPath: sfn.JsonPath.DISCARD,
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
        resultPath: sfn.JsonPath.DISCARD,
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
        resultPath: sfn.JsonPath.DISCARD,
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
          acceleratorVersion: props.acceleratorVersion,
          vpcCidrPoolAssignedTable: vpcCidrPoolTable.tableName,
          subnetCidrPoolAssignedTable: subnetCidrPoolTable.tableName,
          outputTableName: outputsTable.tableName,
          parametersTableName: parametersTable.tableName,
        },
        resultPath: sfn.JsonPath.DISCARD,
      });

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
        .next(storePhase5Output)
        .next(createAdConnectorTask)
        .next(storeCommitIdTask)
        .next(detachQuarantineScpTask)
        .next(storeAllOutputsToSsmTask);

      const commonStep2 = deployPhaseRolesTask
        .next(storePreviousOutput)
        .next(deployPhase0Task)
        .next(storePhase0Output)
        .next(verifyFilesTask)
        .next(createConfigRecordersTask)
        .next(commonStep1);

      const storeAllOutputsChoice = new sfn.Choice(this, 'Store All Phase Outputs?')
        .when(sfn.Condition.booleanEquals('$.storeAllOutputs', true), storeAllPhaseOutputs.next(commonStep2))
        .otherwise(commonStep2)
        .afterwards();

      const commonDefinition = loadOrganizationsTask.startState
        .next(loadAccountsTask)
        .next(installExecRolesInAccounts)
        .next(cdkBootstrapTask)
        .next(deleteVpcTask)
        .next(loadLimitsTask)
        .next(enableTrustedAccessForServicesTask)
        .next(storeAllOutputsChoice);

      const cloudFormationExecRoleManagementChoice = new sfn.Choice(
        this,
        'Install CloudFormation Role in Management Account?',
      )
        .when(
          sfn.Condition.booleanEquals('$.configuration.installCloudFormationMasterRole', true),
          installCfnRoleMasterTask,
        )
        .otherwise(commonDefinition)
        .afterwards();
      installCfnRoleMasterTask.next(commonDefinition);
      // Control Tower Setup
      const ctDefinition = addRoleToServiceCatalog.startState;
      addRoleToServiceCatalog.next(createControlTowerAccountsTask);

      const baseLineChoice = new sfn.Choice(this, 'Baseline?')
        .when(sfn.Condition.stringEquals('$.configuration.baseline', 'CONTROL_TOWER'), ctDefinition)
        .otherwise(createOrganizationAccountsTask)
        .afterwards()
        .next(cloudFormationExecRoleManagementChoice);

      const notificationTopic = new sns.Topic(this, 'MainStateMachineStatusTopic', {
        displayName: `${props.acceleratorPrefix}-MainStateMachine-Status_topic`,
        topicName: `${props.acceleratorPrefix}-MainStateMachine-Status_topic`,
        masterKey: installerCmk,
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
        resultPath: sfn.JsonPath.DISCARD,
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
        resultPath: sfn.JsonPath.DISCARD,
      });

      // Full StateMachine Execution starts from getOrCreateConfigurationTask and wrapped in parallel task for try/catch
      getOrCreateConfigurationTask
        .next(getBaseLineTask)
        .next(compareConfigurationsTask)
        .next(validateOuConfiguration)
        .next(loadOrgConfigurationTask)
        .next(baseLineChoice);

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
