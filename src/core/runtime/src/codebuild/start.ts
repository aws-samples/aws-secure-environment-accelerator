import * as aws from 'aws-sdk';

interface CodeBuildStartInput {
  codeBuildProjectName: string;
  sourceBucketName?: string;
  sourceBucketKey?: string;
  environment?: { [name: string]: string };
}

const codeBuild = new aws.CodeBuild();

export const handler = async (input: CodeBuildStartInput) => {
  console.log(`Starting CodeBuild build...`);
  console.log(JSON.stringify(input, null, 2));

  const { codeBuildProjectName, sourceBucketName, sourceBucketKey, environment = {} } = input;

  // Build environment variables in CodeBuild format
  const environmentVariablesOverride = Object.entries(environment).map(([name, value]) => ({
    name,
    value,
    type: 'PLAINTEXT',
  }));

  const request: aws.CodeBuild.Types.StartBuildInput = {
    projectName: codeBuildProjectName,
    environmentVariablesOverride,
    artifactsOverride: {
      type: 'NO_ARTIFACTS',
    },
  };
  if (sourceBucketName && sourceBucketKey) {
    request.sourceTypeOverride = 'S3';
    request.sourceLocationOverride = `${sourceBucketName}/${sourceBucketKey}`;
  }

  const response = await codeBuild.startBuild(request).promise();
  const build = response.build;
  if (!build) {
    return {
      status: 'FAILURE',
      statusReason: 'No build output received from codebuild.startBuild()',
    };
  }
  return {
    status: 'SUCCESS',
    buildArn: build.arn,
    buildId: build.id,
  };
};
