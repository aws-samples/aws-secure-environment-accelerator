import * as codebuild from '@aws-cdk/aws-codebuild';
import * as iam from '@aws-cdk/aws-iam';
import * as s3assets from '@aws-cdk/aws-s3-assets';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as cdk from '@aws-cdk/core';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';
import { CodeTask } from '@aws-pbmm/common-cdk/lib/stepfunction-tasks';
import { zipFiles } from '@aws-pbmm/common-lambda/lib/util/zip';
import { Archiver } from 'archiver';
import * as path from 'path';
import * as tempy from 'tempy';
import { CreateAccountTask } from './tasks/create-account-task';
import { CreateStackSetTask } from './tasks/create-stack-set-task';
import { BuildTask } from './tasks/build-task';

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
    executionRoleName: string;
  }

  export interface Props extends cdk.StackProps, CommonProps {}
}

export class InitialSetup extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: InitialSetup.Props & BuildProps) {
    super(scope, id);

    new InitialSetup.Pipeline(this, 'Pipeline', {
      configSecretName: props.configSecretName,
      acceleratorPrefix: props.acceleratorPrefix,
      acceleratorName: props.acceleratorName,
      solutionRoot: props.solutionRoot,
      executionRoleName: props.executionRoleName,
      lambdas: props.lambdas,
      solutionZipPath: props.solutionZipPath,
    });
  }

  static async create(scope: cdk.Construct, id: string, props: InitialSetup.Props) {
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
        description: 'This secret contains the information about the accounts that are used for deployment.',
      });

      const configSecretInProgress = new secrets.Secret(this, 'ConfigSecretInProgress', {
        description: 'This is a copy of the config while the deployment of the Accelerator is in progress.',
      });

      // TODO Copy the configSecretInProgress to configSecretLive when deployment is complete.
      //  const configSecretLive = new secrets.Secret(this, 'ConfigSecretLive', {
      //    description: 'This is the config that was used to deploy the current accelerator.',
      //  });

      // TODO This should be the repo containing our code in the future
      // Upload the templates ZIP as an asset to S3
      const solutionZip = new s3assets.Asset(this, 'Code', {
        path: props.solutionZipPath,
      });

      // The pipeline stage `InstallRoles` will allow the pipeline role to assume a role in the sub accounts
      const pipelineRole = new iam.Role(this, 'PipelineRole', {
        roleName: 'AcceleratorPipelineRole',
        assumedBy: new iam.CompositePrincipal(
          new iam.ServicePrincipal('codebuild.amazonaws.com'),
          new iam.ServicePrincipal('lambda.amazonaws.com'),
        ),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      });

      // Define a build specification to build the initial setup templates
      const project = new codebuild.PipelineProject(this, 'CdkDeploy', {
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
              commands: [
                'cd initial-setup/templates',
                'pnpm install',
                'pnpx cdk bootstrap --plugin "$(pwd)/../../plugins/assume-role" --app "pnpx ts-node src/index.ts"',
                'pnpx cdk deploy "*" --require-approval never --plugin "$(pwd)/../../plugins/assume-role" --app "pnpx ts-node src/index.ts"',
              ],
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
            CDK_PLUGIN_ASSUME_ROLE_NAME: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: props.executionRoleName,
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
            'accountName.$': '$.accountName',
            'emailAddress.$': '$.emailAddress',
            'organizationalUnit.$': '$.organizationalUnit',
            'isMasterAccount.$': '$.isMasterAccount',
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
              RoleName: props.executionRoleName,
              // TODO Only add root role for development environments
              AssumedByRoleArn: `arn:aws:iam::${stack.account}:root,${pipelineRole.roleArn}`,
            },
            stackTemplate: {
              s3BucketName: installRoleTemplate.s3BucketName,
              s3ObjectKey: installRoleTemplate.s3ObjectKey,
            },
            'instanceAccounts.$': '$.accounts[?(@.master != true)].id', // Initialize the role in non-master accounts
            instanceRegions: [stack.region],
          },
        }),
        resultPath: 'DISCARD',
      });

      const addRoleToScpTask = new CodeTask(this, 'Add Execution Role to SCP', {
        functionProps: {
          code: props.lambdas.codeForEntry('add-role-to-scp'),
          role: pipelineRole,
        },
        functionPayload: {
          roleName: props.executionRoleName,
          policyName: 'aws-landing-zone-core-mandatory-preventive-guardrails',
        },
        resultPath: 'DISCARD',
      });

      const deployStateMachine = new sfn.StateMachine(this, 'DeplyStateMachine', {
        definition: new BuildTask(this, 'Build', {
          lambdas: props.lambdas,
          role: pipelineRole,
          functionPayload: {
            codeBuildProjectName: project.projectName,
            sourceBucketName: solutionZip.s3BucketName,
            sourceBucketKey: solutionZip.s3ObjectKey,
          },
        }),
      });

      const deployTask = new sfn.Task(this, 'Deploy Initial Setup', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            codeBuildProjectName: project.projectName,
            sourceBucketName: solutionZip.s3BucketName,
            sourceBucketKey: solutionZip.s3ObjectKey,
          },
        }),
        resultPath: 'DISCARD',
      });

      new sfn.StateMachine(this, 'StateMachine', {
        definition: sfn.Chain.start(loadConfigurationTask)
          .next(addRoleToServiceCatalog)
          .next(createAccountsTask)
          .next(loadAccountsTask)
          .next(installRolesTask)
          .next(addRoleToScpTask)
          .next(deployTask),
      });
    }
  }
}
