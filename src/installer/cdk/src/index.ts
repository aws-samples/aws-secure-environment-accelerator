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

import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { publicDecrypt } from 'crypto';
import { Construct } from 'constructs';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

enum RepositorySources {
  GITHUB = 'github',
  CODECOMMIT = 'codecommit',
}

async function main() {
  const pkg = require('../package.json');
  const acceleratorVersion = pkg.version;

  const app = new cdk.App();
  const repoSources = app.node.tryGetContext('repo_source')
    ? [app.node.tryGetContext('repo_source')]
    : [RepositorySources.CODECOMMIT, RepositorySources.GITHUB];

  for (const repoSource of repoSources) {
    if (repoSource !== RepositorySources.GITHUB && repoSource !== RepositorySources.CODECOMMIT) {
      throw new Error(
        `Invalid value for repo_source: ${repoSource} Must repo_source must be one of [github|codecommit]`,
      );
    }
    new Installer(app, `AcceleratorInstaller${repoSource === RepositorySources.CODECOMMIT ? '-CodeCommit' : ''}`, {
      stackName: `AcceleratorInstaller${repoSource === RepositorySources.CODECOMMIT ? '-CodeCommit' : ''}`,
      repoSource,
      acceleratorVersion,
    });
  }
}

export namespace Installer {
  export interface Props extends cdk.StackProps {
    repoSource: string;
    acceleratorVersion: string;
  }
}
class Installer extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Installer.Props) {
    super(scope, id, props);

    const { repoSource, acceleratorVersion } = props;

    const acceleratorPrefixParam = new cdk.CfnParameter(this, 'AcceleratorPrefix', {
      default: 'ASEA-',
      description: 'Accelerator prefix used for deployment.',
      allowedPattern: '[a-zA-Z][a-zA-Z0-9-]{0,8}-',
    });

    const acceleratorNameParam = new cdk.CfnParameter(this, 'AcceleratorName', {
      default: 'ASEA',
      description: 'Accelerator Name used for deployment.',
      allowedPattern: '[a-zA-Z][a-zA-Z0-9]{0,3}',
    });

    const acceleratorName = acceleratorNameParam.valueAsString;
    const acceleratorPrefix = acceleratorPrefixParam.valueAsString;

    const acceleratorConfigS3Bucket = new cdk.CfnParameter(this, 'ConfigS3Bucket', {
      default: 'AWSDOC-EXAMPLE-BUCKET',
      description: 'The S3 bucket name that contains the initial Accelerator configuration.',
    });

    const configRepositoryName = new cdk.CfnParameter(this, 'ConfigRepositoryName', {
      default: 'ASEA-Config-Repo',
      description: 'The AWS CodeCommit repository name that contains the Accelerator configuration.',
    });

    const configBranchName = new cdk.CfnParameter(this, 'ConfigBranchName', {
      default: 'main',
      description: 'The AWS CodeCommit branch name that contains the Accelerator configuration',
    });

    const notificationEmail = new cdk.CfnParameter(this, 'Notification Email', {
      description: 'The notification email that will get Accelerator State Machine execution notifications.',
    });

    const codebuildComputeType = new cdk.CfnParameter(this, 'CodeBuild Compute Type', {
      description: 'The compute type of the build server for the Accelerator deployments.',
      default: codebuild.ComputeType.LARGE,
      allowedValues: [codebuild.ComputeType.MEDIUM, codebuild.ComputeType.LARGE, codebuild.ComputeType.X2_LARGE],
    });

    const stackDeployPageSize = new cdk.CfnParameter(this, 'Deployment Page Size', {
      description: 'The number of stacks to deploy in parallel. This value SHOULD NOT normally be changed.',
      default: 680,
    });

    const backoffStartDelay = new cdk.CfnParameter(this, 'Backoff Start Delay', {
      description:
        'The start delay for exponential backoff of API calls in milliseconds. Leave at the default of 2000 unless needed.',
      default: 2000,
    });

    const stateMachineName = `${acceleratorPrefix}MainStateMachine_sm`;

    // The state machine name has to match the name of the state machine in initial setup
    const stateMachineArn = `arn:aws:states:${this.region}:${this.account}:stateMachine:${stateMachineName}`;

    // Use the `start-execution.js` script in the assets folder
    const stateMachineStartExecutionCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'start-execution.js'));

    // Use the `save-application-version.js` script in the assets folder
    const saveApplicationVersionCode = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'save-application-version.js'),
    );

    // Use the `validate-parameters.js` script in the assets folder
    const validateParametersCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'validate-parameters.js'));

    // Role that is used by the CodeBuild project
    const installerProjectRole = new iam.Role(this, 'InstallerProjectRole', {
      roleName: `${acceleratorPrefix}CB-Installer`,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    // Allow creation of ECR repositories
    installerProjectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:*'],
        resources: [`arn:aws:ecr:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:repository/aws-cdk/*`],
      }),
    );

    // Allow getting authorization tokens for ECR
    installerProjectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: [`*`],
      }),
    );

    installerProjectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/cdk-*`],
      }),
    );

    // Allow all CloudFormation permissions
    installerProjectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:*'],
        resources: [`arn:aws:cloudformation:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stack/*`],
      }),
    );

    // Allow the role to access the CDK asset bucket
    installerProjectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [`arn:aws:s3:::cdk-*`],
      }),
    );

    // Allow the role to create anything through CloudFormation
    installerProjectRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['*'],
        resources: ['*'],
        conditions: {
          'ForAnyValue:StringEquals': {
            'aws:CalledVia': ['cloudformation.amazonaws.com'],
          },
        },
      }),
    );

    const cfnInstallerProjectRole = installerProjectRole.node.defaultChild as iam.CfnRole;
    cfnInstallerProjectRole.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W28', // Resource found with an explicit name, this disallows updates that require replacement of this resource
            reason: 'Using explicit name for installer',
          },
        ],
      },
    };

    const cfnInstallerProjectRoleDefaultPolicy = installerProjectRole.node.findChild('DefaultPolicy').node
      .defaultChild as iam.CfnPolicy;
    cfnInstallerProjectRoleDefaultPolicy.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'F4', // IAM policy should not allow * action
            reason: 'Allows cloudformation to generate resources, needs full access',
          },
          {
            id: 'F39', // IAM policy should not allow * resource with PassRole action
            reason: 'False error: assumeRole using cdk-*',
          },
          {
            id: 'W12', // IAM policy should not allow * resource
            reason: 'Allows cloudformation to generate resources, needs full access',
          },
          {
            id: 'W76', // SPCM for IAM policy document is higher than 25
            reason: 'IAM policy is generated by CDK',
          },
        ],
      },
    };

    // Create a CMK that can be used for the CodePipeline artifacts bucket
    const installerCmk = new kms.Key(this, 'ArtifactsBucketCmk', {
      enableKeyRotation: true,
      description: 'ArtifactsBucketCmk',
      alias: `alias/${acceleratorPrefix}Installer-Key`,
    });

    installerCmk.grantEncryptDecrypt(new iam.AccountRootPrincipal());
    installerCmk.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
        resources: ['*'],
      }),
    );
    // Define a build specification to build the initial setup templates
    const installerProject = new codebuild.PipelineProject(this, 'InstallerProject', {
      projectName: `${acceleratorPrefix}InstallerProject_pl`,
      role: installerProjectRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 18,
            },
            commands: ['npm install --global pnpm@8.9.0', 'pnpm install --frozen-lockfile', 'pnpm recursive run build'],
          },
          pre_build: {
            commands: ['pnpm recursive run build'],
          },
          build: {
            commands: [
              'cd src/core/cdk',
              'export CDK_NEW_BOOTSTRAP=1',
              `pnpx cdk bootstrap aws://${cdk.Aws.ACCOUNT_ID}/${cdk.Aws.REGION} --require-approval never --toolkit-stack-name=${acceleratorPrefix}CDKToolkit --cloudformation-execution-policies=arn:${cdk.Aws.PARTITION}:iam::aws:policy/AdministratorAccess`,
              `pnpx cdk deploy --require-approval never --toolkit-stack-name=${acceleratorPrefix}CDKToolkit`,
            ],
          },
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true, // Allow access to the Docker daemon
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          ACCELERATOR_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: acceleratorName,
          },
          ACCELERATOR_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: acceleratorPrefix,
          },
          ACCELERATOR_STATE_MACHINE_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: stateMachineName,
          },
          CONFIG_REPOSITORY_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: configRepositoryName.valueAsString,
          },
          CONFIG_BRANCH_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: configBranchName.valueAsString,
          },
          CONFIG_S3_BUCKET: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: acceleratorConfigS3Bucket.valueAsString,
          },
          ENABLE_PREBUILT_PROJECT: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: 'true', // Enable Docker prebuilt project
          },
          NOTIFICATION_EMAIL: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: notificationEmail.valueAsString,
          },
          INSTALLER_CMK: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: `alias/${acceleratorPrefix}Installer-Key`,
          },
          BUILD_COMPUTE_TYPE: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: codebuildComputeType.valueAsString,
          },
          DEPLOY_STACK_PAGE_SIZE: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: stackDeployPageSize.valueAsString,
          },
          BACKOFF_START_DELAY: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: backoffStartDelay.valueAsString,
          },
        },
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    // This artifact is used as output for the Github code and as input for the build step
    const sourceArtifact = new codepipeline.Artifact();

    const repoName = new cdk.CfnParameter(this, 'RepositoryName', {
      default: 'aws-secure-environment-accelerator',
      description: 'The name of the git repository containing the Accelerator code.',
    });

    const repoBranch = new cdk.CfnParameter(this, 'RepositoryBranch', {
      // Github release action sets GITHUB_DEFAULT_BRANCH
      // Otherwise fall back to 'release'
      default: process.env.GITHUB_DEFAULT_BRANCH || 'release',
      description: 'The branch of the git repository containing the Accelerator code.',
    });

    let sourceAction: actions.GitHubSourceAction | actions.CodeCommitSourceAction; // Generic action for Source
    let repoOwner: string;

    if (repoSource === RepositorySources.CODECOMMIT) {
      // Create the CodeCommit source action
      sourceAction = new actions.CodeCommitSourceAction({
        actionName: 'CodeCommitSource',
        repository: codecommit.Repository.fromRepositoryName(this, 'CodeCommitRepo', repoName.valueAsString),
        branch: repoBranch.valueAsString,
        output: sourceArtifact,
        trigger: actions.CodeCommitTrigger.NONE,
      });

      // Save off values for UpdateVersion action
      repoOwner = 'CodeCommit';
    } else {
      // Default to GitHub

      // Additional parameter needed for the GitHub secret
      const githubOauthSecretId = new cdk.CfnParameter(this, 'GithubSecretId', {
        default: 'accelerator/github-token',
        description: 'The token to use to access the Github repository.',
      });

      const githubOwner = new cdk.CfnParameter(this, 'GithubOwner', {
        default: 'aws-samples',
        description: 'The owner of the Github repository containing the Accelerator code.',
      });

      // Create the GitHub source action
      sourceAction = new actions.GitHubSourceAction({
        actionName: 'GithubSource',
        owner: githubOwner.valueAsString,
        repo: repoName.valueAsString,
        branch: repoBranch.valueAsString,
        oauthToken: cdk.SecretValue.secretsManager(githubOauthSecretId.valueAsString),
        output: sourceArtifact,
        trigger: actions.GitHubTrigger.NONE,
      });

      // Save off values for UpdateVersion action
      repoOwner = githubOwner.valueAsString;
    }

    // The role that will be used to start the state machine
    const stateMachineExecutionRole = new iam.Role(this, 'ExecutionRoleName', {
      roleName: `${acceleratorPrefix}L-SFN-Execution`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Grant permissions to write logs
    stateMachineExecutionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    stateMachineExecutionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter', 'ssm:GetParameter', 'ssm:GetParameterHistory'],
        resources: ['*'],
      }),
    );

    stateMachineExecutionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: ['*'],
      }),
    );

    // Grant permissions to start the state machine
    stateMachineExecutionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['states:StartExecution'],
        resources: [stateMachineArn],
      }),
    );

    const cfnStateMachineExecutionRole = stateMachineExecutionRole.node.defaultChild as iam.CfnRole;
    cfnStateMachineExecutionRole.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W28', // Resource found with an explicit name, this disallows updates that require replacement of this resource
            reason: 'Using explicit name for installer',
          },
        ],
      },
    };

    const cfnStateMachineExecutionRoleDefaultPolicy = stateMachineExecutionRole.node.findChild('DefaultPolicy').node
      .defaultChild as iam.CfnPolicy;
    cfnStateMachineExecutionRoleDefaultPolicy.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W12', // IAM policy should not allow * resource
            reason: 'Allows stateMachine to generate resources, needs full access',
          },
          {
            id: 'W76', // SPCM for IAM policy document is higher than 25
            reason: 'IAM policy is generated by CDK',
          },
        ],
      },
    };

    // Create the Lambda function that is responsible for launching the state machine
    const stateMachineStartExecutionLambda = new lambda.Function(this, 'ExecutionLambda', {
      functionName: `${acceleratorPrefix}Installer-StartExecution`,
      role: stateMachineExecutionRole,
      // Inline code is only allowed for Node.js version 12
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromInline(stateMachineStartExecutionCode.toString()),
      handler: 'index.handler',
    });

    const cfnStateMachineStartExecutionLambda = stateMachineStartExecutionLambda.node
      .defaultChild as lambda.CfnFunction;
    cfnStateMachineStartExecutionLambda.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W58', // Lambda functions require permission to write CloudWatch Logs
            reason: 'CloudWatch Logs not required for installer',
          },
          {
            id: 'W89', // Lambda functions should be deployed inside a VPC
            reason: 'Lambda inside VPC not required for installer',
          },
          {
            id: 'W92', // Lambda functions should define ReservedConcurrentExecutions to reserve simultaneous executions
            reason: 'ReservedConcurrentExecutions not required for installer',
          },
        ],
      },
    };

    // Create the Lambda function that is responsible for launching the state machine
    const saveApplicationVersionLambda = new lambda.Function(this, 'SaveApplicationVersionLambda', {
      functionName: `${acceleratorPrefix}Installer-SaveApplicationVersion`,
      role: stateMachineExecutionRole,
      // Inline code is only allowed for Node.js version 12
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromInline(saveApplicationVersionCode.toString()),
      handler: 'index.handler',
    });

    const cfnSaveApplicationVersionLambda = saveApplicationVersionLambda.node.defaultChild as lambda.CfnFunction;
    cfnSaveApplicationVersionLambda.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W58', // Lambda functions require permission to write CloudWatch Logs
            reason: 'CloudWatch Logs not required for installer',
          },
          {
            id: 'W89', // Lambda functions should be deployed inside a VPC
            reason: 'Lambda inside VPC not required for installer',
          },
          {
            id: 'W92', // Lambda functions should define ReservedConcurrentExecutions to reserve simultaneous executions
            reason: 'ReservedConcurrentExecutions not required for installer',
          },
        ],
      },
    };

    // Create the Lambda function that is responsible for validating previous parameters
    const validateParametersLambda = new lambda.Function(this, 'ValidateParametersLambda', {
      functionName: `${acceleratorPrefix}Installer-ValidateParameters`,
      role: stateMachineExecutionRole,
      // Inline code is only allowed for Node.js version 12
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromInline(validateParametersCode.toString()),
      handler: 'index.handler',
    });

    const cfnValidateParametersLambda = validateParametersLambda.node.defaultChild as lambda.CfnFunction;
    cfnValidateParametersLambda.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W58', // Lambda functions require permission to write CloudWatch Logs
            reason: 'CloudWatch Logs not required for installer',
          },
          {
            id: 'W89', // Lambda functions should be deployed inside a VPC
            reason: 'Lambda inside VPC not required for installer',
          },
          {
            id: 'W92', // Lambda functions should define ReservedConcurrentExecutions to reserve simultaneous executions
            reason: 'ReservedConcurrentExecutions not required for installer',
          },
        ],
      },
    };

    // Role that is used by the CodePipeline
    // Permissions for
    //   - accessing the artifacts bucket
    //   - publishing to the manual approval SNS topic
    //   - running the CodeBuild project
    //   - running the state machine execution Lambda function
    // will be added automatically by the CDK Pipeline construct
    const installerPipelineRole = new iam.Role(this, 'InstallerPipelineRole', {
      roleName: `${acceleratorPrefix}CP-Installer`,
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    // This bucket will be used to store the CodePipeline source
    const installerArtifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: installerCmk,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    const cfnInstallerArtifactsBucket = installerArtifactsBucket.node.defaultChild as s3.CfnBucket;
    cfnInstallerArtifactsBucket.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W35', // S3 Bucket should have access logging configured
            reason: 'Access logs not required for installer',
          },
        ],
      },
    };

    // Allow only https requests
    installerArtifactsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [installerArtifactsBucket.bucketArn, installerArtifactsBucket.arnForObjects('*')],
        principals: [new iam.AnyPrincipal()],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
        effect: iam.Effect.DENY,
      }),
    );

    const installerPipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      role: installerPipelineRole,
      pipelineName: `${acceleratorPrefix}InstallerPipeline`,
      artifactBucket: installerArtifactsBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'ValidateParameters',
          actions: [
            new actions.LambdaInvokeAction({
              actionName: 'ValidateParameters',
              lambda: validateParametersLambda,
              role: installerPipelineRole,
              userParameters: {
                acceleratorName,
                acceleratorPrefix,
              },
            }),
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            new actions.CodeBuildAction({
              actionName: 'DeployAccelerator',
              project: installerProject,
              input: sourceArtifact,
              role: installerPipelineRole,
            }),
          ],
        },
        {
          stageName: 'UpdateVersion',
          actions: [
            new actions.LambdaInvokeAction({
              actionName: 'UpdateVersion',
              lambda: saveApplicationVersionLambda,
              role: installerPipelineRole,
              userParameters: {
                commitId: sourceAction.variables.commitId,
                repository: repoName,
                owner: repoOwner,
                branch: repoBranch,
                acceleratorVersion,
                acceleratorName,
                acceleratorPrefix,
              },
            }),
          ],
        },
        {
          stageName: 'Execute',
          actions: [
            new actions.LambdaInvokeAction({
              actionName: 'ExecuteAcceleratorStateMachine',
              lambda: stateMachineStartExecutionLambda,
              role: installerPipelineRole,
              userParameters: {
                stateMachineArn,
              },
            }),
          ],
        },
      ],
    });

    cdk.Aspects.of(this).add(new cdk.Tag('Accelerator', `${acceleratorName}1`));

    const cfnInstallerPipelineRole = installerPipelineRole.node.defaultChild as iam.CfnRole;
    cfnInstallerPipelineRole.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W28', // Resource found with an explicit name, this disallows updates that require replacement of this resource
            reason: 'Using explicit name for installer',
          },
        ],
      },
    };

    const cfnInstallerPipelineRoleDefaultPolicy = installerPipeline.role.node.findChild('DefaultPolicy').node
      .defaultChild as iam.CfnPolicy;
    cfnInstallerPipelineRoleDefaultPolicy.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W12', // IAM policy should not allow * resource
            reason: 'Allows CodePipeline to generate resources, needs full access',
          },
          {
            id: 'W76', // SPCM for IAM policy document is higher than 25
            reason: 'IAM policy is generated by CDK',
          },
        ],
      },
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
