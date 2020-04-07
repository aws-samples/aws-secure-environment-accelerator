import * as aws from 'aws-sdk';

interface CodeBuildStartInput {
  codeBuildProjectName: string;
  sourceBucketName: string;
  sourceBucketKey: string;
}

export const handler = async (input: CodeBuildStartInput) => {
  console.log(`Starting CodeBuild project...`);
  console.log(JSON.stringify(input, null, 2));

  const { codeBuildProjectName, sourceBucketName, sourceBucketKey } = input;

  const build = new aws.CodeBuild();
  const response = await build
    .startBuild({
      projectName: codeBuildProjectName,
      sourceTypeOverride: 'S3',
      sourceLocationOverride: `${sourceBucketName}/${sourceBucketKey}`,
      artifactsOverride: {
        type: 'NO_ARTIFACTS',
      },
    })
    .promise();
};
