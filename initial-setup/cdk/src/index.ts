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
import * as lambda from '@aws-cdk/aws-lambda';

interface BuildProps {
  lambdas: WebpackBuild;
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
      lambdas,
      solutionZipPath,
    });
  }
}

export namespace InitialSetup {
  export interface PipelineProps extends CommonProps {
    lambdas: WebpackBuild;
    solutionZipPath: string;
  }

  export class Pipeline extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: PipelineProps) {
      super(scope, id);

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

      // TODO Copy the configSecretInProgress to configSecretLive when deployment is complete.
      //  const configSecretLive = new secrets.Secret(this, 'ConfigSecretLive', {
      //    description: 'This is the config that was used to deploy the current accelerator.',
      //  });

      // TODO This should be the repo containing our code in the future
      // Upload the templates ZIP as an asset to S3
      const solutionZip = new s3assets.Asset(this, 'SolutionZip', {
        path: props.solutionZipPath,
      });

      // The pipeline stage `InstallRoles` will allow the pipeline role to assume a role in the sub accounts
      const pipelineRole = new iam.Role(this, 'Role', {
        roleName: 'AcceleratorMasterRole',
        assumedBy: new iam.CompositePrincipal(
          // TODO Only add root role for development environments
          new iam.ServicePrincipal('codebuild.amazonaws.com'),
          new iam.ServicePrincipal('lambda.amazonaws.com'),
        ),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      });

      // TODO Restrict role permissions
      const dnsEndpointIpPollerRole = new iam.Role(this, 'LambdaRoleRoute53Resolver', {
        roleName: 'LambdaRoleRoute53Resolver',
        assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal('lambda.amazonaws.com')),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      });

      const dnsEndpointIpPollerLambda = new lambda.Function(this, 'DnsEndpointIpPoller', {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: props.lambdas.codeForEntry('get-dns-endpoint-ipaddress'),
        handler: 'index.handler',
        role: dnsEndpointIpPollerRole,
        environment: {
          ACCELERATOR_EXECUTION_ROLE_NAME: props.stateMachineExecutionRole,
        },
      });

      // Allow Cloudformation to trigger the handler
      dnsEndpointIpPollerLambda.addPermission('cfn-dns-endpoint-ip-pooler', {
        action: 'lambda:InvokeFunction',
        principal: new iam.AnyPrincipal(),
      });

      // Define a build specification to build the initial setup templates
      const project = new codebuild.PipelineProject(this, 'DeployProject', {
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
          },
        },
      });

      const loadConfigurationTask = new CodeTask(this, 'Load Configuration', {
        functionProps: {
          code: props.lambdas.codeForEntry('load-configuration'),
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
          code: props.lambdas.codeForEntry('add-role-to-service-catalog'),
          role: pipelineRole,
        },
        functionPayload: {
          roleArn: pipelineRole.roleArn,
          portfolioName: avmPortfolioName,
        },
        resultPath: 'DISCARD',
      });

      const createAccountStateMachine = new sfn.StateMachine(scope, 'CreateAccountStateMachine', {
        definition: new CreateAccountTask(scope, 'Create', {
          lambdas: props.lambdas,
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
          code: props.lambdas.codeForEntry('load-accounts'),
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

      const installRolesStateMachine = new sfn.StateMachine(this, 'InstallRolesStateMachine', {
        definition: new CreateStackSetTask(this, 'Install', {
          lambdas: props.lambdas,
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

      // TODO We might want to load this from the Landing Zone configuration
      const coreMandatoryScpName = 'aws-landing-zone-core-mandatory-preventive-guardrails';

      const addRoleToScpTask = new CodeTask(this, 'Add Execution Role to SCP', {
        functionProps: {
          code: props.lambdas.codeForEntry('add-role-to-scp'),
          role: pipelineRole,
        },
        functionPayload: {
          roleName: props.stateMachineExecutionRole,
          policyName: coreMandatoryScpName,
        },
        resultPath: 'DISCARD',
      });

      const enableResourceSharingTask = new CodeTask(this, 'Enable Resource Sharing', {
        functionProps: {
          code: props.lambdas.codeForEntry('enable-resource-sharing'),
          role: pipelineRole,
        },
        resultPath: 'DISCARD',
      });

      const deployStateMachine = new sfn.StateMachine(this, 'DeployStateMachine', {
        definition: new BuildTask(this, 'Build', {
          lambdas: props.lambdas,
          role: pipelineRole,
        }),
      });

      const deployTaskCommonInput = {
        codeBuildProjectName: project.projectName,
        sourceBucketName: solutionZip.s3BucketName,
        sourceBucketKey: solutionZip.s3ObjectKey,
      };

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
          code: props.lambdas.codeForEntry('store-stack-output'),
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
          code: props.lambdas.codeForEntry('store-stack-output'),
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
      const blockS3PublicAccessTask = new CodeTask(this, 'Block S3 Public Access', {
        functionProps: {
          code: props.lambdas.codeForEntry('s3-block-public-access'),
          role: pipelineRole,
        },
        functionPayload: {
          assumeRoleName: props.stateMachineExecutionRole,
          configSecretSourceId: props.configSecretName,
          'accounts.$': '$.accounts',
        },
        resultPath: 'DISCARD',
      });

      const addTagsToSharedResourcesTask = new CodeTask(this, 'Add Tags to Shared Resources', {
        functionProps: {
          code: props.lambdas.codeForEntry('add-tags-to-shared-resources'),
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

      new sfn.StateMachine(this, 'StateMachine', {
        stateMachineName: props.stateMachineName,
        definition: sfn.Chain.start(loadConfigurationTask)
          .next(addRoleToServiceCatalog)
          .next(createAccountsTask)
          .next(loadAccountsTask)
          .next(installRolesTask)
          .next(addRoleToScpTask)
          .next(blockS3PublicAccessTask)
          .next(enableResourceSharingTask)
          .next(deployPhase0Task)
          .next(storePhase0Output)
          .next(deployPhase1Task)
          .next(storePhase1Output)
          .next(deployPhase2Task)
          .next(addTagsToSharedResourcesTask),
      });
    }
  }
}
