import 'jest';

const AWS = require('aws-sdk');

const putJobSuccessResult = jest.fn().mockReturnValue({
  promise: jest.fn().mockResolvedValue({}),
});

const putJobFailureResult = jest.fn().mockReturnValue({
  promise: jest.fn().mockResolvedValue({}),
});

const startExecution = jest.fn().mockReturnValue({
  promise: jest.fn().mockResolvedValue({}),
});

AWS.CodePipeline = jest.fn().mockImplementation(() => ({
  putJobSuccessResult,
  putJobFailureResult,
}));
AWS.StepFunctions = jest.fn().mockImplementation(() => ({
  startExecution,
}));

// Include handler after mocking the AWS SDK methods
const { handler } = require('../assets/start-execution');

test('the State Machine execution should be started', async () => {
  // Create a valid CodePipeline event
  const event = createCodePipelineEvent({
    jobId: '0001',
    userParameters: {
      stateMachineArn: 'arn:state-machine',
    },
  });

  // Call the Lambda function handler
  await handler(event);

  expect(startExecution).toBeCalledWith({
    input: '{"scope":"FULL", "mode": "APPLY"}',
    stateMachineArn: 'arn:state-machine',
  });
  expect(putJobSuccessResult).toBeCalledWith({
    jobId: '0001',
  });
});

test('the State Machine execution should not be started when State Machine ARN is missing', async () => {
  // Create a valid CodePipeline event
  const event = createCodePipelineEvent({
    jobId: '0001',
    userParameters: {},
  });

  // Call the Lambda function handler
  await handler(event, { awsRequestId: 'request-0001' });

  expect(putJobFailureResult).toBeCalledWith({
    jobId: '0001',
    failureDetails: {
      externalExecutionId: 'request-0001',
      message: expect.any(String),
      type: 'JobFailed',
    },
  });
});

function createCodePipelineEvent({ jobId, userParameters }: { jobId: string; userParameters: unknown }) {
  return {
    'CodePipeline.job': {
      id: jobId,
      accountId: '111111111111',
      data: {
        actionConfiguration: {
          configuration: {
            FunctionName: 'PBMMAccel-Installer-StartExecution',
            UserParameters: JSON.stringify(userParameters),
          },
        },
        inputArtifacts: [],
        outputArtifacts: [],
        artifactCredentials: {
          accessKeyId: 'ACCESS_KEY_ID',
          secretAccessKey: 'SECRET_ACCESS_KEY',
          sessionToken: 'SESSION_TOKEN',
          expirationTime: 0,
        },
      },
    },
  };
}
