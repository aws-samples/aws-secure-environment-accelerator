import * as codebuild from '@aws-cdk/aws-codebuild';
import * as iam from '@aws-cdk/aws-iam';
import * as s3assets from '@aws-cdk/aws-s3-assets';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
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

  export interface Props extends AcceleratorStackProps, CommonProps {}
}

export class InitialSetup extends AcceleratorStack {
  constructor(scope: cdk.Construct, id: string, props: InitialSetup.Props & BuildProps) {
    super(scope, id, props);

    new InitialSetup.Pipeline(this, 'Pipeline', props);
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
        roleName: 'AcceleratorPipelineRole',
        assumedBy: new iam.CompositePrincipal(
          // TODO Only add root role for development environments
          new iam.ServicePrincipal('codebuild.amazonaws.com'),
          new iam.ServicePrincipal('lambda.amazonaws.com'),
        ),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      });

      // This key is used to encrypt passwords in sub accounts
      const passwordsKey = new kms.Key(this, 'PasswordsKey', {
        alias: 'Passwords',
        description: 'This key is used to encrypt passwords that are used by sub accounts.',
      });

      // Allow the pipeline role to administer this key
      passwordsKey.grant(pipelineRole, 'kms:*');

      // Allow secrets manager to use this KMS key
      passwordsKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid:
            'Allow access through AWS Secrets Manager for all principals in the account that are authorized to use AWS Secrets Manager',
          effect: iam.Effect.ALLOW,
          actions: [
            'kms:Encrypt',
            'kms:Decrypt',
            'kms:ReEncrypt*',
            'kms:GenerateDataKey*',
            'kms:CreateGrant',
            'kms:DescribeKey',
          ],
          principals: [new iam.AnyPrincipal()],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'kms:ViaService': `secretsmanager.${cdk.Aws.REGION}.amazonaws.com`,
              'kms:CallerAccount': cdk.Aws.ACCOUNT_ID,
            },
          },
        }),
      );

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
            PASSWORDS_KMS_KEY_ARN: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: passwordsKey.keyArn,
            },
            ACCELERATOR_EXECUTION_ROLE_NAME: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: props.executionRoleName,
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

      // Initialize the role in all accounts excluding the primary
      // We exclude the primary as this stack is probably installed in the primary account as well
      // and you cannot create a stack set instance in your own account
      const installRolesInstanceAccountIds = '$.accounts[?(@.primary != true)].id';

      const installRolesTask = new sfn.Task(this, 'Install Execution Roles', {
        task: new tasks.StartExecution(installRolesStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            stackName: `${props.acceleratorPrefix}PipelineRole`,
            stackCapabilities: ['CAPABILITY_NAMED_IAM'],
            stackParameters: {
              RoleName: props.executionRoleName,
              // TODO Only add root role for development environments
              AssumedByRoleArn: `arn:aws:iam::${stack.account}:root,arn:aws:iam::${stack.account}:role/Admin,${pipelineRole.roleArn}`,
            },
            stackTemplate: {
              s3BucketName: installRoleTemplate.s3BucketName,
              s3ObjectKey: installRoleTemplate.s3ObjectKey,
            },
            'instanceAccounts.$': installRolesInstanceAccountIds,
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
          roleName: props.executionRoleName,
          policyName: coreMandatoryScpName,
        },
        resultPath: 'DISCARD',
      });

      const addRoleToKmsKeyTask = new CodeTask(this, 'Add Execution Roles to Passwords KMS Key', {
        functionProps: {
          code: props.lambdas.codeForEntry('add-role-to-kms-key'),
          role: pipelineRole,
        },
        functionPayload: {
          roleName: props.executionRoleName,
          'accounts.$': '$.accounts',
          kmsKeyId: passwordsKey.keyId,
        },
        resultPath: 'DISCARD',
      });

      const storeStackOutput = new CodeTask(this, 'Store Stack Output', {
        functionProps: {
          code: props.lambdas.codeForEntry('store-stack-output'),
          role: pipelineRole,
        },
        functionPayload: {
          stackOutputSecretId: stackOutputSecret.secretArn,
          assumeRoleName: props.executionRoleName,
          'accounts.$': '$.accounts',
        },
        resultPath: 'DISCARD',
      });

      const storeShareNetworkStackOutput = new CodeTask(this, 'Store Shared Network Stack Output', {
        functionProps: {
          code: props.lambdas.codeForEntry('store-stack-output'),
          role: pipelineRole,
        },
        functionPayload: {
          stackOutputSecretId: stackOutputSecret.secretArn,
          assumeRoleName: props.executionRoleName,
          'accounts.$': '$.accounts',
        },
        resultPath: 'DISCARD',
      });

      const storePerimeterStackOutput = new CodeTask(this, 'Store Perimeter Stack Output', {
        functionProps: {
          code: props.lambdas.codeForEntry('store-stack-output'),
          role: pipelineRole,
        },
        functionPayload: {
          stackOutputSecretId: stackOutputSecret.secretArn,
          assumeRoleName: props.executionRoleName,
          'accounts.$': '$.accounts',
        },
        resultPath: 'DISCARD',
      });

      const storeMasterStackOutput = new CodeTask(this, 'Store Master Stack Output', {
        functionProps: {
          code: props.lambdas.codeForEntry('store-stack-output'),
          role: pipelineRole,
        },
        functionPayload: {
          stackOutputSecretId: stackOutputSecret.secretArn,
          assumeRoleName: props.executionRoleName,
          'accounts.$': '$.accounts',
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

      const deployLogArchiveTask = new sfn.Task(this, 'Deploy Log Archive Stacks', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/log-archive.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      const deploySharedNetworkTask = new sfn.Task(this, 'Deploy Shared Network Stacks', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/shared-network.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      const enableResourceShareTask = new CodeTask(this, 'Enable Resource Sharing', {
        functionProps: {
          code: props.lambdas.codeForEntry('enable-resource-share'),
          role: pipelineRole,
        },
        resultPath: 'DISCARD',
      });

      const vpcSharingTask = new sfn.Task(this, 'VPC Sharing Stacks', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/vpc-sharing.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      const attachTagsTask = new CodeTask(this, 'Attach Tags to Shared Subnets', {
        functionProps: {
          code: props.lambdas.codeForEntry('attach-tags-to-subnets'),
          role: pipelineRole,
        },
        functionPayload: {
          'accounts.$': '$.accounts',
          assumeRoleName: props.executionRoleName,
          configSecretSourceId: configSecretInProgress.secretArn,
          stackOutputSecretId: stackOutputSecret.secretArn,
        },
        resultPath: 'DISCARD',
      });

      const deployPerimeterAccountkTask = new sfn.Task(this, 'Deploy Perimeter Stacks', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/perimeter.ts',
          },
        }),
        resultPath: 'DISCARD',
      });

      const deployMasterAccountkTask = new sfn.Task(this, 'Deploy Master Stacks', {
        task: new tasks.StartExecution(deployStateMachine, {
          integrationPattern: sfn.ServiceIntegrationPattern.SYNC,
          input: {
            ...deployTaskCommonInput,
            appPath: 'apps/master.ts',
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
          .next(enableResourceShareTask)
          .next(addRoleToKmsKeyTask)
          .next(deployLogArchiveTask)
          .next(storeStackOutput)
          .next(deploySharedNetworkTask)
          .next(storeShareNetworkStackOutput)
          .next(deployPerimeterAccountkTask)
          .next(storePerimeterStackOutput)
          .next(deployMasterAccountkTask)
          .next(storeMasterStackOutput)
          .next(vpcSharingTask)
          .next(attachTagsTask),
      });
    }
  }
}
