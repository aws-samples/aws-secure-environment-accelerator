import * as aws from 'aws-sdk';
import { CodePipelineEvent, Context } from 'aws-lambda';

const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!!;

export const handler = async (input: CodePipelineEvent, context: Context) => {
  console.log(`Triggering account creation using AVM...`);
  console.log(JSON.stringify(input, null, 2));

  const job = input['CodePipeline.job'];
  const jobId: string = job.id!!;
  console.log('jobId: ' + jobId);

  // The user parameters contain a serialized JSON object
  const parameters = JSON.parse(job.data.actionConfiguration.configuration.UserParameters);

  const accountName: string = parameters.accountName!!;
  console.log('accountName: ' + accountName);

  const principalRoleArn: string = parameters.principalRoleArn!!;
  console.log('principalRoleArn: ' + principalRoleArn);

  const stm = new aws.StepFunctions();
  await stm.startExecution({
    stateMachineArn: STATE_MACHINE_ARN,
    input: JSON.stringify({
      jobId,
      accountName,
      principalRoleArn,
    }, null, 2),
  }).promise();
};
