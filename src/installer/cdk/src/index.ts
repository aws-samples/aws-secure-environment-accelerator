import * as fs from 'fs';
import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as actions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

async function main() {
  const pkg = require('../package.json');
  const acceleratorVersion = pkg.version;

  const app = new cdk.App();

  enum RepositorySources {
    GITHUB = 'github',
    CODECOMMIT = 'codecommit',
  }

  const repoSource = app.node.tryGetContext('repo_source') || RepositorySources.GITHUB;

  if (repoSource !== RepositorySources.GITHUB && repoSource !== RepositorySources.CODECOMMIT) {
    throw new Error(`Invalid value for repo_source: ${repoSource} Must repo_source must be one of [github|codecommit]`);
  }

  const stack = new cdk.Stack(app, 'InstallerStack', {
    stackName: 'AcceleratorInstaller',
    terminationProtection: true,
  });

  const acceleratorPrefixParam = new cdk.CfnParameter(stack, 'AcceleratorPrefix', {
    default: 'Accel-',
    description: 'Accelerator prefix used for deployment.',
    allowedPattern: '[a-zA-Z][a-zA-Z0-9-]{0,8}-',
  });

  const acceleratorNameParam = new cdk.CfnParameter(stack, 'AcceleratorName', {
    default: 'AWS',
    description: 'Accelerator Name used for deployment.',
    allowedPattern: '[a-zA-Z][a-zA-Z0-9]{0,3}',
  });

  const acceleratorName = acceleratorNameParam.valueAsString;
  const acceleratorPrefix = acceleratorPrefixParam.valueAsString;

  const acceleratorConfigS3Bucket = new cdk.CfnParameter(stack, 'ConfigS3Bucket', {
    default: 'AWSDOC-EXAMPLE-BUCKET',
    description: 'The S3 bucket name that contains the initial Accelerator configuration.',
  });

  const configRepositoryName = new cdk.CfnParameter(stack, 'ConfigRepositoryName', {
    default: 'Accelerator-Configuration',
    description: 'The AWS CodeCommit repository name that contains the Accelerator configuration.',
  });

  const configBranchName = new cdk.CfnParameter(stack, 'ConfigBranchName', {
    default: 'main',
    description: 'The AWS CodeCommit branch name that contains the Accelerator configuration',
  });

  const notificationEmail = new cdk.CfnParameter(stack, 'Notification Email', {
    description: 'The notification email that will get Accelerator State Machine execution notifications.',
  });

  const stateMachineName = `${acceleratorPrefix}MainStateMachine_sm`;

  // The state machine name has to match the name of the state machine in initial setup
  const stateMachineArn = `arn:aws:states:${stack.region}:${stack.account}:stateMachine:${stateMachineName}`;

  // Use the `start-execution.js` script in the assets folder
  const stateMachineStartExecutionCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'start-execution.js'));

  // Use the `save-application-version.js` script in the assets folder
  const saveApplicationVersionCode = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'save-application-version.js'),
  );

  // Use the `validate-parameters.js` script in the assets folder
  const validateParametersCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'validate-parameters.js'));

  // Role that is used by the CodeBuild project
  const installerProjectRole = new iam.Role(stack, 'InstallerProjectRole', {
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
      resources: [`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/*`],
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
      // resources: [`arn:aws:s3:::${acceleratorPrefix.toLowerCase()}cdktoolkit-stagingbucket-*`],
      resources: [`arn:aws:s3:::cdk-${acceleratorPrefix.toLowerCase()}assets-*`],
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

  // Define a build specification to build the initial setup templates
  const installerProject = new codebuild.PipelineProject(stack, 'InstallerProject', {
    projectName: `${acceleratorPrefix}InstallerProject_pl`,
    role: installerProjectRole,
    buildSpec: codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases: {
        install: {
          'runtime-versions': {
            nodejs: 12,
          },
          // The flag '--unsafe-perm' is necessary to run pnpm scripts in Docker
          commands: ['npm install --global pnpm', 'pnpm install --unsafe-perm'],
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
      buildImage: codebuild.LinuxBuildImage.STANDARD_3_0,
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
      },
    },
  });

  // This artifact is used as output for the Github code and as input for the build step
  const sourceArtifact = new codepipeline.Artifact();

  const repoName = new cdk.CfnParameter(stack, 'RepositoryName', {
    default: 'aws-secure-environment-accelerator',
    description: 'The name of the git repository containing the Accelerator code.',
  });

  const repoBranch = new cdk.CfnParameter(stack, 'RepositoryBranch', {
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
      repository: codecommit.Repository.fromRepositoryName(stack, 'CodeCommitRepo', repoName.valueAsString),
      branch: repoBranch.valueAsString,
      output: sourceArtifact,
      trigger: actions.CodeCommitTrigger.NONE,
    });

    // Save off values for UpdateVersion action
    repoOwner = 'CodeCommit';
  } else {
    // Default to GitHub

    // Additional parameter needed for the GitHub secret
    const githubOauthSecretId = new cdk.CfnParameter(stack, 'GithubSecretId', {
      default: 'accelerator/github-token',
      description: 'The token to use to access the Github repository.',
    });

    const githubOwner = new cdk.CfnParameter(stack, 'GithubOwner', {
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
  const stateMachineExecutionRole = new iam.Role(stack, 'ExecutionRoleName', {
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

  // Create the Lambda function that is responsible for launching the state machine
  const stateMachineStartExecutionLambda = new lambda.Function(stack, 'ExecutionLambda', {
    functionName: `${acceleratorPrefix}Installer-StartExecution`,
    role: stateMachineExecutionRole,
    runtime: lambda.Runtime.NODEJS_12_X,
    code: lambda.Code.fromInline(stateMachineStartExecutionCode.toString()),
    handler: 'index.handler',
  });

  // Create the Lambda function that is responsible for launching the state machine
  const saveApplicationVersionLambda = new lambda.Function(stack, 'SaveApplicationVersionLambda', {
    functionName: `${acceleratorPrefix}Installer-SaveApplicationVersion`,
    role: stateMachineExecutionRole,
    runtime: lambda.Runtime.NODEJS_12_X,
    code: lambda.Code.fromInline(saveApplicationVersionCode.toString()),
    handler: 'index.handler',
  });

  // Create the Lambda function that is responsible for validating previous parameters
  const validateParametersLambda = new lambda.Function(stack, 'ValidateParametersLambda', {
    functionName: `${acceleratorPrefix}Installer-ValidateParameters`,
    role: stateMachineExecutionRole,
    runtime: lambda.Runtime.NODEJS_12_X,
    code: lambda.Code.fromInline(validateParametersCode.toString()),
    handler: 'index.handler',
  });

  // Role that is used by the CodePipeline
  // Permissions for
  //   - accessing the artifacts bucket
  //   - publishing to the manual approval SNS topic
  //   - running the CodeBuild project
  //   - running the state machine execution Lambda function
  // will be added automatically by the CDK Pipeline construct
  const installerPipelineRole = new iam.Role(stack, 'InstallerPipelineRole', {
    roleName: `${acceleratorPrefix}CP-Installer`,
    assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
  });

  // Create a CMK that can be used for the CodePipeline artifacts bucket
  const installerArtifactsBucketCmk = new kms.Key(stack, 'ArtifactsBucketCmk', {
    enableKeyRotation: true,
    description: 'ArtifactsBucketCmk',
  });
  const installerArtifactsBucketCmkAlias = new kms.Alias(stack, 'ArtifactsBucketCmkAlias', {
    aliasName: `accelerator/installer-artifacts/s3`,
    targetKey: installerArtifactsBucketCmk,
  });

  // This bucket will be used to store the CodePipeline source
  const installerArtifactsBucket = new s3.Bucket(stack, 'ArtifactsBucket', {
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    encryption: s3.BucketEncryption.KMS,
    encryptionKey: installerArtifactsBucketCmkAlias,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    versioned: true,
    objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
  });

  new codepipeline.Pipeline(stack, 'Pipeline', {
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

  cdk.Aspects.of(stack).add(new cdk.Tag('Accelerator', acceleratorName));
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
