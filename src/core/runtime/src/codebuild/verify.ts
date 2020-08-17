import * as aws from 'aws-sdk';

interface CodeBuildVerifyInput {
  buildId: string;
}

export const handler = async (input: Partial<CodeBuildVerifyInput>) => {
  console.log(`Verifying status of CodeBuild build...`);
  console.log(JSON.stringify(input, null, 2));

  const { buildId } = input;

  const codeBuild = new aws.CodeBuild();
  const getBuilds = await codeBuild
    .batchGetBuilds({
      ids: [buildId!],
    })
    .promise();

  const builds = getBuilds.builds;
  if (!builds || builds.length !== 1) {
    return {
      status: 'FAILURE',
      statusReason: `Could not find CodeBuild build with ID ${buildId}`,
    };
  }

  const build = builds[0];
  if (build.buildStatus === 'SUCCEEDED') {
    return {
      status: 'SUCCESS',
      statusReason: `The CodeBuild build with ID ${buildId} succeeded`,
    };
  } else if (build.buildStatus === 'IN_PROGRESS') {
    return {
      status: 'IN_PROGRESS',
      statusReason: `The CodeBuild build with ID ${buildId} is in progress`,
    };
  } else {
    return {
      status: 'FAILURE',
      statusReason: `The CodeBuild build with ID ${buildId} failed with status ${build.buildStatus}`,
    };
  }
};
