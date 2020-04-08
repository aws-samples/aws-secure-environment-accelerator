import * as aws from 'aws-sdk';

interface CodeBuildStartInput {
  codeBuildProjectName: string;
  sourceBucketName: string;
  sourceBucketKey: string;
}

export const handler = async (input: CodeBuildStartInput) => {
  console.log(`Starting CodeBuild build...`);
  console.log(JSON.stringify(input, null, 2));

  const { codeBuildProjectName, sourceBucketName, sourceBucketKey } = input;

  const codeBuild = new aws.CodeBuild();
  const response = await codeBuild
    .startBuild({
      projectName: codeBuildProjectName,
      sourceTypeOverride: 'S3',
      sourceLocationOverride: `${sourceBucketName}/${sourceBucketKey}`,
      artifactsOverride: {
        type: 'NO_ARTIFACTS',
      },
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
