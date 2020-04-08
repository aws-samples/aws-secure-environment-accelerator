import * as path from 'path';
import * as tempy from 'tempy';
import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as actions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3assets from '@aws-cdk/aws-s3-assets';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';
import { Accounts } from '@aws-pbmm/common-lambda/lib/aws/accounts';
import { CreateStackSetAction } from './actions/create-stack-set-action';
import { CreateStackAction } from './actions/create-stack-action';
import { CreateAccountAction } from './actions/create-account-action';
import { zipFiles } from '@aws-pbmm/common-lambda/lib/util/zip';
import { Archiver } from 'archiver';

interface BuildProps {
  lambdas: WebpackBuild;
  solutionZipPath: string;
}

export namespace InitialSetup {
  export interface CommonProps {
    configSecretArn: string;
    acceleratorPrefix: string;
    acceleratorName: string;
    solutionRoot: string;
    executionRoleName: string;
    accounts: Accounts;
  }

  export interface Props extends cdk.StackProps, CommonProps {}
}

export class InitialSetup extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: InitialSetup.Props & BuildProps) {
    super(scope, id);

    new InitialSetup.Pipeline(this, 'Pipeline', {
      configSecretArn: props.configSecretArn,
      acceleratorPrefix: props.acceleratorPrefix,
      acceleratorName: props.acceleratorName,
      solutionRoot: props.solutionRoot,
      executionRoleName: props.executionRoleName,
      accounts: props.accounts,
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
        ignore: ['**/cdk.out/**', '**/node_modules/**', '**/pnpm-lock.yaml', '**/.prettierrc'],
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
}

export namespace InitialSetup {
  export class Pipeline extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: InitialSetup.PipelineProps) {
      super(scope, id);

      // This role will be used to run the pipeline
      // The pipeline stage `InstallRoles` will allow the pipeline role to assume a role in the sub accounts
      const pipelineRole = new iam.Role(this, 'PipelineRole', {
        roleName: 'AcceleratorPipelineRole',
        assumedBy: new iam.CompositePrincipal(
          new iam.ServicePrincipal('codepipeline.amazonaws.com'),
          new iam.ServicePrincipal('lambda.amazonaws.com'),
        ),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      });

      pipelineRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:Invoke'],
          resources: ['*'],
        }),
      );

      const accountExecutionRoleFn = (cdkId: string, accountId: string) => {
        return iam.Role.fromRoleArn(this, cdkId, `arn:aws:iam::${accountId}:role/${props.executionRoleName}`, {
          mutable: false,
        });
      };

      // Get all the sub account execution roles that we will assume with the pipeline role
      const accountExecutionRoles = {
        security: accountExecutionRoleFn('SecurityExecutionRole', props.accounts.security.id),
        logArchive: accountExecutionRoleFn('LogArchiveExecutionRole', props.accounts.logArchive.id),
        sharedServices: accountExecutionRoleFn('SharedServicesExecutionRole', props.accounts.sharedServices.id),
        sharedNetwork: accountExecutionRoleFn('SharedNetworkExecutionRole', props.accounts.sharedNetwork.id),
      };

      const buildRole = new iam.Role(this, 'BuildRole', {
        assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      });

      buildRole.attachInlinePolicy(
        new iam.Policy(this, 'BuildRoleAllowSecretConfig', {
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['secretsmanager:GetSecretValue'],
              resources: [props.configSecretArn],
            }),
          ],
        }),
      );

      // Define a build specification to build the initial setup templates
      const project = new codebuild.PipelineProject(this, 'CdkMasterBuild', {
        role: buildRole,
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': {
                nodejs: 10,
              },
              commands: ['npm install --global pnpm', 'pnpm install'],
            },
            build: {
              commands: ['cd initial-setup/templates', 'pnpm install', 'pnpx cdk synth -o dist'],
            },
          },
          artifacts: {
            'base-directory': 'initial-setup/templates/dist',
            files: ['*.template.json'],
          },
        }),
        environment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2,
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
            ACCELERATOR_SECRET_NAME: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: props.configSecretArn,
            },
          },
        },
      });

      const templatesSourceOutput = new codepipeline.Artifact();
      const templatesSynthOutput = new codepipeline.Artifact('CdkSynthOutput');

      // TODO This should be the repo containing our code in the future
      // Upload the templates ZIP as an asset to S3
      const solutionZip = new s3assets.Asset(this, 'Code', {
        path: props.solutionZipPath,
      });

      // This bucket will contain the CodePipeline artifacts
      const artifactBucket = new s3.Bucket(this, 'ArtifactsBucket', {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      new codepipeline.Pipeline(this, 'Pipeline', {
        role: pipelineRole,
        artifactBucket,
        stages: [
          {
            // Get the source from the templates ZIP file for now
            stageName: 'Source',
            actions: [
              new actions.S3SourceAction({
                actionName: 'Source',
                bucket: solutionZip.bucket,
                bucketKey: solutionZip.s3ObjectKey,
                output: templatesSourceOutput,
              }),
            ],
          },
          {
            stageName: 'Build',
            actions: [
              new actions.CodeBuildAction({
                actionName: 'Build',
                project,
                input: templatesSourceOutput,
                outputs: [templatesSynthOutput],
              }),
            ],
          },
          {
            // This stage installs pipeline roles into sub accounts
            stageName: 'InstallRoles',
            actions: [
              new CreateStackSetAction({
                actionName: 'Deploy',
                regions: ['ca-central-1'], // TODO
                accounts: [
                  // The accounts to install the pipeline role in
                  props.accounts.sharedServices.id,
                  props.accounts.sharedNetwork.id,
                ],
                stackName: `${props.acceleratorPrefix}PipelineRole`,
                stackTemplateArtifact: templatesSynthOutput.atPath('AssumeRole.template.json'),
                stackCapabilities: ['CAPABILITY_NAMED_IAM'],
                stackParameters: {
                  RoleName: props.executionRoleName,
                  AssumedByRoleArn: pipelineRole.roleArn,
                },
                lambdaRole: pipelineRole,
                lambdas: props.lambdas,
                waitSeconds: 10,
              }),
            ],
          },
          {
            stageName: 'CreateSharedNetworkAccount',
            actions: [
              new CreateAccountAction({
                actionName: 'Deploy',
                accountName: 'shared-network',
                acceleratorConfigSecretArn: props.configSecretArn,
                lambdaRole: pipelineRole,
                lambdas: props.lambdas,
                waitSeconds: 60,
              }),
            ],
          },
          {
            stageName: 'ConfigureSharedNetworkAccount',
            actions: [
              new CreateStackAction({
                actionName: 'Deploy',
                assumeRole: accountExecutionRoles.sharedNetwork,
                stackName: `${props.acceleratorPrefix}SharedNetwork`,
                stackTemplateArtifact: templatesSynthOutput.atPath('SharedNetwork.template.json'),
                lambdaRole: pipelineRole,
                lambdas: props.lambdas,
                waitSeconds: 10,
              }),
            ],
          },
          {
            stageName: 'ConfigureOrganizationalUnits',
            actions: [
              new CreateStackAction({
                actionName: 'Deploy',
                assumeRole: accountExecutionRoles.sharedNetwork,
                stackName: `${props.acceleratorPrefix}OrganizationalUnits`,
                stackTemplateArtifact: templatesSynthOutput.atPath('OrganizationalUnits.template.json'),
                lambdaRole: pipelineRole,
                lambdas: props.lambdas,
                waitSeconds: 60,
              }),
            ],
          },
        ],
      });
    }
  }
}
