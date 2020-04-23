import * as fs from 'fs';
import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as actions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const app = new cdk.App();

  const stack = new cdk.Stack(app, 'InstallerStack', {
    stackName: 'AcceleratorInstaller',
  });

  const acceleratorName = new cdk.CfnParameter(stack, 'AcceleratorName', {
    default: 'PBMM',
    description: 'The name of the Accelerator. The name will used as value for the Accelerator tag.',
  });

  const acceleratorPrefix = new cdk.CfnParameter(stack, 'AcceleratorPrefix', {
    default: 'PBMMAccel-',
    description: 'The prefix that will be used by the Accelerator when creating resources.',
  });

  const acceleratorConfigSecretId = new cdk.CfnParameter(stack, 'AcceleratorSecretId', {
    default: 'accelerator/config',
    description: 'The ID of the secret that contains the Accelerator configuration.',
  });

  const githubOauthSecretId = new cdk.CfnParameter(stack, 'GithubSecretId', {
    default: 'accelerator/github-token',
    description: 'The token to use to access the Github repository.',
  });

  const githubOwner = new cdk.CfnParameter(stack, 'GithubOwner', {
    default: 'aws-samples',
    description: 'The owner of the Github repository containing the Accelerator code.',
  });

  const githubRepository = new cdk.CfnParameter(stack, 'GithubRepository', {
    default: 'aws-pbmm-accelerator',
    description: 'The name of the Github repository containing the Accelerator code.',
  });

  const githubBranch = new cdk.CfnParameter(stack, 'GithubBranch', {
    default: 'release',
    description: 'The branch of the Github repository containing the Accelerator code.',
  });

  const stateMachineName = `${acceleratorPrefix.valueAsString}MainStateMachine`;

  // The state machine name has to match the name of the state machine in initial setup
  const stateMachineArn = `arn:aws:states:${stack.region}:${stack.account}:stateMachine:${stateMachineName}`;

  // Use the `start-execution.js` script in the assets folder
  const stateMachineStartExecutionCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'start-execution.js'));

  // Role that is used by the CodeBuild project
  const installerProjectRole = new iam.Role(stack, 'InstallerRole', {
    assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
  });

  // Allow all CloudFormation permissions
  installerProjectRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['cloudformation:*'],
      resources: [`arn:aws:cloudformation:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stack/*`],
    }),
  );

  // Allow the role to access the CDK asset bucket
  installerProjectRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['s3:*'],
      resources: [`arn:aws:s3:::cdktoolkit-stagingbucket-*`],
    }),
  );

  // Allow the role to create anything through CloudFormation
  installerProjectRole.addToPolicy(
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
    projectName: `${acceleratorPrefix.valueAsString}InstallerProject`,
    role: installerProjectRole,
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
          commands: ['cd accelerator/cdk', 'pnpx cdk deploy --require-approval never'],
        },
      },
    }),
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_3_0,
      computeType: codebuild.ComputeType.MEDIUM,
      environmentVariables: {
        ACCELERATOR_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: acceleratorName.valueAsString,
        },
        ACCELERATOR_PREFIX: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: acceleratorPrefix.valueAsString,
        },
        ACCELERATOR_CONFIG_SECRET_ID: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: acceleratorConfigSecretId.valueAsString,
        },
        ACCELERATOR_STATE_MACHINE_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: stateMachineName,
        },
      },
    },
  });

  // The role that will be used to start the state machine
  const stateMachineExecutionRole = new iam.Role(stack, 'ExecutionRoleName', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  // Grant permissions to write logs
  stateMachineExecutionRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );

  // Grant permissions to start the state machine
  stateMachineExecutionRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['states:StartExecution'],
      resources: [stateMachineArn],
    }),
  );

  // Create the Lambda function that is responsible for launching the state machine
  const stateMachineStartExecutionLambda = new lambda.Function(stack, 'ExecutionLambda', {
    role: stateMachineExecutionRole,
    runtime: lambda.Runtime.NODEJS_12_X,
    code: lambda.Code.fromInline(stateMachineStartExecutionCode.toString()),
    handler: 'index.handler',
    environment: {
      STATE_MACHINE_ARN: stateMachineArn,
    },
  });

  // This artifact is used as output for the Github code and as input for the build step
  const sourceArtifact = new codepipeline.Artifact();

  new codepipeline.Pipeline(stack, 'Pipeline', {
    pipelineName: `${acceleratorPrefix.valueAsString}InstallerPipeline`,
    // The default bucket is encrypted
    // That is not necessary for this pipeline so we create a custom unencrypted bucket.
    artifactBucket: new s3.Bucket(stack, 'ArtifactsBucket'),
    stages: [
      {
        stageName: 'Source',
        actions: [
          new actions.GitHubSourceAction({
            actionName: 'GithubSource',
            owner: githubOwner.valueAsString,
            repo: githubRepository.valueAsString,
            branch: githubBranch.valueAsString,
            oauthToken: cdk.SecretValue.secretsManager(githubOauthSecretId.valueAsString),
            output: sourceArtifact,
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
          }),
        ],
      },
      {
        stageName: 'Execute',
        actions: [
          new actions.LambdaInvokeAction({
            actionName: 'ExecuteAcceleratorStateMachine',
            lambda: stateMachineStartExecutionLambda,
          }),
        ],
      },
    ],
  });

  stack.node.applyAspect(new cdk.Tag('Accelerator', acceleratorName.valueAsString));
}

// tslint:disable-next-line: no-floating-promises
main();
