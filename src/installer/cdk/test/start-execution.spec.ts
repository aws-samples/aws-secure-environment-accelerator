/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

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
    input: '{"scope":"FULL","mode":"APPLY","verbose":"0"}',
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
