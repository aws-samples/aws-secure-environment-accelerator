import * as aws from 'aws-sdk';

interface CodeBuildStartInput {
  codeBuildProjectName: string;
  sourceBucketName: string;
  sourceBucketKey: string;
  appPath: string;
}

export const handler = async (input: CodeBuildStartInput) => {
  console.log(`Starting CodeBuild build...`);
  console.log(JSON.stringify(input, null, 2));

  const { codeBuildProjectName, sourceBucketName, sourceBucketKey, appPath } = input;

  const codeBuild = new aws.CodeBuild();
  const response = await codeBuild
    .startBuild({
      projectName: codeBuildProjectName,
      sourceTypeOverride: 'S3',
      sourceLocationOverride: `${sourceBucketName}/${sourceBucketKey}`,
      artifactsOverride: {
        type: 'NO_ARTIFACTS',
      },
      environmentVariablesOverride: [
        {
          name: 'APP_PATH',
          value: appPath,
          type: 'PLAINTEXT',
        },
      ],
    })
    .promise();

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
