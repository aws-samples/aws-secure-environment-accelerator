const aws = require('aws-sdk');

export async function handler(event) {
  const codepipeline = new aws.CodePipeline();
  const jobId = event['CodePipeline.job'].id;
  try {
    const sfn = new aws.StepFunctions();
    await sfn
      .startExecution({
        stateMachineArn: process.env.STATE_MACHINE_ARN,
      })
      .promise();

    return codepipeline
      .putJobSuccessResult({
        jobId,
      })
      .promise();
  } catch (e) {
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
}
