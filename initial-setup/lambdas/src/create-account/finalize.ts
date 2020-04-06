import * as aws from 'aws-sdk';
import { Context } from 'aws-lambda';

const pipeline = new aws.CodePipeline();

export interface FinalizeMasterExecutionRoleInput {
  jobId: string;
  exception?: any;
  verify: {
    status?: 'SUCCESS' | 'FAILURE';
    statusReason?: string;
  };
}

export const handler = async (input: FinalizeMasterExecutionRoleInput, context: Context) => {
  console.log(`Finalizing job...`);
  console.log(JSON.stringify(input, null, 2));

  const { jobId, exception, verify } = input;

  if (verify?.status === 'SUCCESS') {
    return pipeline
      .putJobSuccessResult({
        jobId,
      })
      .promise();
  } else if (verify?.status === 'FAILURE') {
    return pipeline
      .putJobFailureResult({
        jobId,
        failureDetails: {
          type: 'JobFailed',
          message: verify?.statusReason || 'Unknown',
          externalExecutionId: context.awsRequestId,
        },
      })
      .promise();
  } else {
    const message = exception ? JSON.stringify(exception) : 'Unknown output status';
    return pipeline
      .putJobFailureResult({
        jobId,
        failureDetails: {
          type: 'JobFailed',
          message,
          externalExecutionId: context.awsRequestId,
        },
      })
      .promise();
  }
};
