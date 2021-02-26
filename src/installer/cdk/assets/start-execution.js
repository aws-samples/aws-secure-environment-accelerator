const AWS = require('aws-sdk');

const codepipeline = new AWS.CodePipeline();
const sfn = new AWS.StepFunctions();

exports.handler = async function (event, context) {
  console.info(`Starting state machine execution...`);
  console.info(JSON.stringify(event, null, 2));

  const jobInfo = event['CodePipeline.job'];
  const jobId = jobInfo.id;

  try {
    const userParametersString = jobInfo.data.actionConfiguration.configuration.UserParameters;
    const userParameters = JSON.parse(userParametersString);
    if (!userParameters.stateMachineArn) {
      throw new Error(`"stateMachineArn" is missing from user parameters`);
    }

    const smInput = {
      scope: 'FULL',
      mode: 'APPLY',
    }

    await sfn
      .startExecution({
        stateMachineArn: userParameters.stateMachineArn,
        input: JSON.stringify(smInput),
      })
      .promise();

    return codepipeline
      .putJobSuccessResult({
        jobId,
      })
      .promise();
  } catch (e) {
    console.info(`Unexpected error while starting execution: ${e}`);

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
