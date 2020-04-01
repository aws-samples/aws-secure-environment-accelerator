import * as aws from 'aws-sdk';
import { CodePipelineEvent, Context } from 'aws-lambda';

const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!!;

export const handler = async (input: CodePipelineEvent, context: Context) => {
  console.log(`Triggering stack set creation...`);
  console.log(JSON.stringify(input, null, 2));

  const job = input['CodePipeline.job'];
  const jobId: string = job.id!!;

  // The user parameters contain a serialized JSON object
  const parameters = JSON.parse(job.data.actionConfiguration.configuration.UserParameters);

  // Load artifact from the parameters
  const artifact = job.data.inputArtifacts.find((a) => a.name === parameters.stackTemplateArtifact);
  if (!artifact) {
    throw new Error(`Cannot find input artifact with name "${parameters.stackTemplateArtifact}"`);
  }

  // TODO Use a library like io-ts to parse the input
  const assumeRoleArn: string = parameters.assumeRoleArn!!;
  const stackName: string = parameters.stackName!!;
  const stackCapabilities: string | undefined = parameters.stackCapabilities;
  const stackParameters: string | undefined = parameters.stackParameters;
  const stackTemplateArtifactBucket = artifact.location.s3Location.bucketName;
  const stackTemplateArtifactKey = artifact.location.s3Location.objectKey;
  const stackTemplateArtifactPath = parameters.stackTemplateArtifactPath!!;
  const stackTemplateArtifactCredentials = job.data.artifactCredentials!!;
  const accounts: string[] = parameters.accounts!!;
  const regions: string[] = parameters.regions!!;

  const stm = new aws.StepFunctions();
  await stm
    .startExecution({
      stateMachineArn: STATE_MACHINE_ARN,
      input: JSON.stringify(
        {
          jobId,
          stackName,
          stackCapabilities,
          stackParameters,
          stackTemplateArtifactBucket,
          stackTemplateArtifactKey,
          stackTemplateArtifactPath,
          stackTemplateArtifactCredentials,
          assumeRoleArn,
          accounts,
          regions,
        },
        null,
        2,
      ),
    })
    .promise();
};
