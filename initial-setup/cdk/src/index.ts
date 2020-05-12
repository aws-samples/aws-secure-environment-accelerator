import * as codebuild from '@aws-cdk/aws-codebuild';
import * as iam from '@aws-cdk/aws-iam';
import * as s3assets from '@aws-cdk/aws-s3-assets';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as cdk from '@aws-cdk/core';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';
import { zipFiles } from '@aws-pbmm/common-lambda/lib/util/zip';
import { Archiver } from 'archiver';
import * as path from 'path';
import * as tempy from 'tempy';
import { BuildTask } from './tasks/build-task';
import { CreateAccountTask } from './tasks/create-account-task';
import { CreateStackSetTask } from './tasks/create-stack-set-task';
import { CreateAdConnectorTask } from './tasks/create-adconnector-task';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';

interface BuildProps {
  lambdaCode: lambda.Code;
  solutionZipPath: string;
}

export namespace InitialSetup {
  export interface CommonProps {
    configSecretName: string;
    acceleratorPrefix: string;
    acceleratorName: string;
    solutionRoot: string;
    stateMachineName: string;
    stateMachineExecutionRole: string;
  }

  export interface Props extends AcceleratorStackProps, CommonProps {}
}

export class InitialSetup extends AcceleratorStack {
  constructor(scope: cdk.Construct, id: string, props: InitialSetup.Props & BuildProps) {
    super(scope, id, props);

    new InitialSetup.Pipeline(this, 'Pipeline', props);
  }

  static async create(scope: cdk.Construct, id: string, props: InitialSetup.Props): Promise<InitialSetup> {
    const initialSetupRoot = path.join(props.solutionRoot, 'initial-setup');
    const lambdasRoot = path.join(initialSetupRoot, 'lambdas');

    // Build all the Lambda functions using Webpack
    const lambdas = await WebpackBuild.build({
      workingDir: lambdasRoot,
      webpackConfigFile: 'webpack.config.ts',
    });

    // All lambdas are bundled into index.js
    const lambdaCode = lambdas.codeForEntry();

    const solutionZipPath = tempy.file({
      extension: 'zip',
    });

    // TODO This should be the repo containing our code in the future
    // We want to ZIP the the initial setup ourselves to make sure the ZIP file is valid
    console.log(`Zipping solution directory "${props.solutionRoot} to "${solutionZipPath}"`);

    await zipFiles(solutionZipPath, (archive: Archiver) => {
      archive.glob('**/*', {
        cwd: props.solutionRoot,
        ignore: [
          '**/accounts.json',
          '**/cdk.out/**',
          '**/cdk.json',
          '**/config.json',
          '**/node_modules/**',
          '**/pnpm-lock.yaml',
          '**/.prettierrc',
        ],
      });
    });

    return new InitialSetup(scope, id, {
      ...props,
      lambdaCode,
      solutionZipPath,
    });
  }
}

export namespace InitialSetup {
  export interface PipelineProps extends CommonProps {
    lambdaCode: lambda.Code;
    solutionZipPath: string;
  }

  export class Pipeline extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: PipelineProps) {
      super(scope, id);

      const { lambdaCode } = props;

      const stack = cdk.Stack.of(this);

      const accountsSecret = new secrets.Secret(this, 'Accounts', {
        secretName: 'accelerator/accounts',
        description: 'This secret contains the information about the accounts that are used for deployment.',
      });

      const stackOutputSecret = new secrets.Secret(this, 'StackOutput', {
        secretName: 'accelerator/outputs',
        description: 'This secret contains a copy of the outputs of the Accelerator stacks.',
      });

      const configSecretInProgress = new secrets.Secret(this, 'ConfigSecretInProgress', {
        secretName: 'accelerator/config/in-progress',
        description: 'This is a copy of the config while the deployment of the Accelerator is in progress.',
      });

      const limitsSecret = new secrets.Secret(this, 'Limits', {
        secretName: 'accelerator/limits',
        description: 'This secret contains a copy of the service limits of the Accelerator accounts.',
      });

      // TODO Copy the configSecretInProgress to configSecretLive when deployment is complete.
      //  const configSecretLive = new secrets.Secret(this, 'ConfigSecretLive', {
      //    description: 'This is the config that was used to deploy the current accelerator.',
      //  });

      // TODO This should be the repo containing our code in the future
      // Upload the templates ZIP as an asset to S3
      const solutionZip = new s3assets.Asset(this, 'SolutionZip', {
        path: props.solutionZipPath,
      });

      const cfnCustomResourceRole = new iam.Role(this, 'CfnCustomResourceRole', {
        roleName: `${props.acceleratorPrefix}CustomResourceRole`,
        assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal('lambda.amazonaws.com')),
      });

      // The pipeline stage `InstallRoles` will allow the pipeline role to assume a role in the sub accounts
      const pipelineRole = new iam.Role(this, 'Role', {
        roleName: `${props.acceleratorPrefix}AcceleratorMasterRole`,
        assumedBy: new iam.CompositePrincipal(
          // TODO Only add root role for development environments
          new iam.ServicePrincipal('codebuild.amazonaws.com'),
          new iam.ServicePrincipal('lambda.amazonaws.com'),
        ),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      });

      cfnCustomResourceRole.addToPolicy(
        new iam.PolicyStatement({
          resources: ['*'],
          actions: ['sts:AssumeRole', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        }),
      );

      const dnsEndpointIpPollerLambda = new lambda.Function(this, 'DnsEndpointIpPoller', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambdaCode,
        handler: 'index.getDnsEndpointIps',
        role: cfnCustomResourceRole,
        functionName: 'CfnCustomResourceR53EndpointIPPooler',
        environment: {
          ACCELERATOR_EXECUTION_ROLE_NAME: props.stateMachineExecutionRole,
        },
      });

      const enableSecurityHubLambda = new lambda.Function(this, 'EnableSecurityHub', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambdaCode,
        handler: 'index.enableSecurityHub',
        role: cfnCustomResourceRole,
        functionName: 'CfnCustomResourceEnableSecurityHub',
        environment: {
          ACCELERATOR_EXECUTION_ROLE_NAME: props.stateMachineExecutionRole,
        },
        timeout: cdk.Duration.seconds(900),
      });

      const inviteMembersSecurityHub = new lambda.Function(this, 'InviteMembersSecurityHub', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambdaCode,
        handler: 'index.inviteMembersSecurityHub',
        role: cfnCustomResourceRole,
        functionName: 'CfnCustomResourceInviteMembersSecurityHub',
        environment: {
          ACCELERATOR_EXECUTION_ROLE_NAME: props.stateMachineExecutionRole,
        },
        timeout: cdk.Duration.seconds(900),
      });

      const acceptInviteSecurityHub = new lambda.Function(this, 'AcceptInviteSecurityHub', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambdaCode,
        handler: 'index.acceptInviteSecurityHub',
        role: cfnCustomResourceRole,
        functionName: 'CfnCustomResourceAcceptInviteSecurityHub',
        environment: {
          ACCELERATOR_EXECUTION_ROLE_NAME: props.stateMachineExecutionRole,
        },
        timeout: cdk.Duration.seconds(900),
      });

      // Define a build specification to build the initial setup templates
      const project = new codebuild.PipelineProject(this, `${props.acceleratorPrefix}Deploy_pl`, {
        role: pipelineRole,
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': {
                nodejs: 12,
              },
              commands: ['npm install --global pnpm', 'pnpm install'],
            },
            build: {
              commands: ['cd initial-setup/templates', 'bash codebuild-deploy.sh'],
            },
          },
        }),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_3_0,
          computeType: codebuild.ComputeType.MEDIUM,
          environmentVariables: {
            ACCELERATOR_NAME: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: props.acceleratorName,
            },
            ACCELERATOR_PREFIX: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: props.acceleratorPrefix,
            },
            CONFIG_SECRET_ID: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: configSecretInProgress.secretArn,
            },
            ACCOUNTS_SECRET_ID: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: accountsSecret.secretArn,
            },
            STACK_OUTPUT_SECRET_ID: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: stackOutputSecret.secretArn,
            },
            LIMITS_SECRET_ID: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: limitsSecret.secretArn,
            },
            ACCELERATOR_EXECUTION_ROLE_NAME: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: props.stateMachineExecutionRole,
            },
            CDK_PLUGIN_ASSUME_ROLE_NAME: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: props.stateMachineExecutionRole,
            },
            CFN_DNS_ENDPOINT_IPS_LAMBDA_ARN: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: dnsEndpointIpPollerLambda.functionArn,
            },
            CFN_ENABLE_SECURITY_HUB_LAMBDA_ARN: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: enableSecurityHubLambda.functionArn,
            },
            CFN_INVITE_MEMBERS_SECURITY_HUB_LAMBDA_ARN: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: inviteMembersSecurityHub.functionArn,
            },
            CFN_ACCEPT_INVITE_SECURITY_HUB_LAMBDA_ARN: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: acceptInviteSecurityHub.functionArn,
            },
          },
        },
      });

      const loadConfigurationTask = new CodeTask(this, 'Load Configuration', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.loadConfigurationStep',
          role: pipelineRole,
        },
        functionPayload: {
          configSecretSourceId: props.configSecretName,
          configSecretInProgressId: configSecretInProgress.secretArn,
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
        resultPath: '$.accounts',
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
          configSecretId: configSecretInProgress.secretArn,
          limitsSecretId: limitsSecret.secretArn,
          assumeRoleName: props.stateMachineExecutionRole,
          'accounts.$': '$.accounts',
        },
        resultPath: '$.limits',
      });

      // creating a bucket to store SCP artifacts
      const scpArtifactBucket = new s3.Bucket(stack, 'ScpArtifactsBucket', {
        versioned: true,
      });

      const scpArtifactsFolderPath = path.join(__dirname, '..', '..', '..', 'reference-artifacts', 'SCPs');

      new s3deployment.BucketDeployment(stack, 'ScpArtifactsDeployment', {
        sources: [s3deployment.Source.asset(scpArtifactsFolderPath)],
        destinationBucket: scpArtifactBucket,
        destinationKeyPrefix: 'scp',
      });

      const addScpTask = new CodeTask(this, 'Add SCP to Org', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.addScpStep',
          role: pipelineRole,
        },
        functionPayload: {
          acceleratorPrefix: props.acceleratorPrefix,
          configSecretId: configSecretInProgress.secretArn,
          scpBucketName: scpArtifactBucket.bucketName,
          scpBucketPrefix: 'scp',
          'accounts.$': '$.accounts',
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

      // const preDeployParallelTask = new sfn.Parallel(this, 'PreDeploy', {
      // });
      // preDeployParallelTask.branch(loadLimitsTask);
      // preDeployParallelTask.branch(addScpTask);
      // preDeployParallelTask.branch(enableResourceSharingTask);

      const deployStateMachine = new sfn.StateMachine(this, `${props.acceleratorPrefix}Deploy_sm`, {
        stateMachineName: `${props.acceleratorPrefix}Deploy_sm`,
        definition: new BuildTask(this, 'Build', {
          lambdaCode,
          role: pipelineRole,
        }),
      });

      const deployTaskCommonInput = {
        codeBuildProjectName: project.projectName,
        sourceBucketName: solutionZip.s3BucketName,
        sourceBucketKey: solutionZip.s3ObjectKey,
      };

      // creating a bucket to store IAM Policy artifacts
      const iamPolicyArtifactBucket = new s3.Bucket(stack, 'IamPolicyArtifactsBucket', {
        versioned: true,
        bucketName: 'pbmmaccel-iam-policy-config',
      });

      const iamPolicyArtifactsFolderPath = path.join(
        __dirname,
        '..',
        '..',
        '..',
        'reference-artifacts',
        'iam-policies',
      );

      new s3deployment.BucketDeployment(stack, 'IamPolicyArtifactsDeployment', {
        sources: [s3deployment.Source.asset(iamPolicyArtifactsFolderPath)],
        destinationBucket: iamPolicyArtifactBucket,
        destinationKeyPrefix: 'iam-policy',
      });

      const deployPhase0Task = new sfn.Task(this, 'Deploy Phase 0', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/phase-0.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      const storePhase0Output = new CodeTask(this, 'Store Phase 0 Output', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.storeStackOutputStep',
          role: pipelineRole,
        },
        functionPayload: {
          stackOutputSecretId: stackOutputSecret.secretArn,
          assumeRoleName: props.stateMachineExecutionRole,
          'accounts.$': '$.accounts',
        },
        resultPath: 'DISCARD',
      });

      const deployPhase1Task = new sfn.Task(this, 'Deploy Phase 1', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/phase-1.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      const storePhase1Output = new CodeTask(this, 'Store Phase 1 Output', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.storeStackOutputStep',
          role: pipelineRole,
        },
        functionPayload: {
          stackOutputSecretId: stackOutputSecret.secretArn,
          assumeRoleName: props.stateMachineExecutionRole,
          'accounts.$': '$.accounts',
        },
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
          'accounts.$': '$.accounts',
          configSecretSourceId: configSecretInProgress.secretArn,
          stackOutputSecretId: stackOutputSecret.secretArn,
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
          configSecretSourceId: configSecretInProgress.secretArn,
          stackOutputSecretId: stackOutputSecret.secretArn,
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

      const deployPhase2Task = new sfn.Task(this, 'Deploy Phase 2', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/phase-2.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      const storePhase2Output = new CodeTask(this, 'Store Phase 2 Output', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.storeStackOutputStep',
          role: pipelineRole,
        },
        functionPayload: {
          stackOutputSecretId: stackOutputSecret.secretArn,
          assumeRoleName: props.stateMachineExecutionRole,
          'accounts.$': '$.accounts',
        },
        resultPath: 'DISCARD',
      });

      const deployPhase3Task = new sfn.Task(this, 'Deploy Phase 3', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/phase-3.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      const storePhase3Output = new CodeTask(this, 'Store Phase 3 Output', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.storeStackOutputStep',
          role: pipelineRole,
        },
        functionPayload: {
          stackOutputSecretId: stackOutputSecret.secretArn,
          assumeRoleName: props.stateMachineExecutionRole,
          'accounts.$': '$.accounts',
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
          configSecretSourceId: configSecretInProgress.secretArn,
          stackOutputSecretId: stackOutputSecret.secretArn,
        },
        resultPath: 'DISCARD',
      });

      const createAdConnectorStateMachine = new sfn.StateMachine(scope, 'CreateAdConnectorStateMachine', {
        stateMachineName: `${props.acceleratorPrefix}+CreateAdConnector`,
        definition: new CreateAdConnectorTask(scope, 'CreateAD', {
          lambdaCode,
          role: pipelineRole,
        }),
      });

      const createAdConnectorTask = new sfn.Task(this, 'Create AD Connector', {
        task: new tasks.StartExecution(createAdConnectorStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            'accounts.$': '$.accounts',
            assumeRoleName: props.stateMachineExecutionRole,
            configSecretSourceId: configSecretInProgress.secretArn,
            stackOutputSecretId: stackOutputSecret.secretArn,
          },
        }),
      });

      const deployPhase4Task = new sfn.Task(this, 'Deploy Phase 4', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/phase-4.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      const storePhase4Output = new CodeTask(this, 'Store Phase 4 Output', {
        functionProps: {
          code: lambdaCode,
          handler: 'index.storeStackOutputStep',
          role: pipelineRole,
        },
        functionPayload: {
          stackOutputSecretId: stackOutputSecret.secretArn,
          assumeRoleName: props.stateMachineExecutionRole,
          'accounts.$': '$.accounts',
        },
        resultPath: 'DISCARD',
      });

      const deployPhase5Task = new sfn.Task(this, 'Deploy Phase 5', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/phase-5.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      new sfn.StateMachine(this, 'StateMachine', {
        stateMachineName: props.stateMachineName,
        definition: sfn.Chain.start(loadConfigurationTask)
          .next(addRoleToServiceCatalog)
          .next(createAccountsTask)
          .next(loadAccountsTask)
          .next(installRolesTask)
          .next(loadLimitsTask)
          .next(addScpTask)
          .next(enableTrustedAccessForServicesTask)
          .next(deployPhase0Task)
          .next(storePhase0Output)
          .next(deployPhase1Task)
          .next(storePhase1Output)
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
          .next(accountDefaultSettingsTask),
      });
    }
  }
}
