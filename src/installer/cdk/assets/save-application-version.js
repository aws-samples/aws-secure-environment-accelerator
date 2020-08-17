const AWS = require('aws-sdk');

const codepipeline = new AWS.CodePipeline();
const ssm = new AWS.SSM();

exports.handler = async function (event, context) {
  console.info(`Saving Accelerator Application Version...`);
  console.info(JSON.stringify(event, null, 2));

  const jobInfo = event['CodePipeline.job'];
  const jobId = jobInfo.id;
  
  try {
    const userParametersString = jobInfo.data.actionConfiguration.configuration.UserParameters;
    const userParameters = JSON.parse(userParametersString);

    const currentTime = new Date();
    const versionData = {
      Branch: userParameters.branch,
      Repository: userParameters.repository,
      CommitId: userParameters.commitId,
      Owner:userParameters.owner,
      DeployTime: currentTime.toString(),
      AcceleratorVersion: userParameters.acceleratorVersion,
    }
    const param = await ssm.putParameter({
      Name: '/accelerator/version', 
      Value: JSON.stringify(versionData, null, 2), 
      Type: 'String',
      Overwrite: true,
    }).promise();
    console.log(`Updated Application Version : ${param}`);
    return codepipeline
      .putJobSuccessResult({
        jobId,
      })
      .promise();
  } catch (e) {
    console.info(`Unexpected error while Saving Application Versio: ${e}`);
    return codepipeline
      .putJobFailureResult({
        jobId,
        failureDetails: {
          externalExecutionId: context.awsRequestId,
          type: 'JobFailed',
          message: JSON.stringify(e),
        },
      })
      .promise();
  }
};
