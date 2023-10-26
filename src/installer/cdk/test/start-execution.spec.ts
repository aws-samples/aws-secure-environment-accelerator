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
const {
  CodePipeline,
  PutJobSuccessResultCommand,
  PutJobFailureResultCommand,
} = require('@aws-sdk/client-codepipeline');
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
import { mockClient } from 'aws-sdk-client-mock';

const mockCodePipeline = mockClient(CodePipeline);
const mockSFNClient = mockClient(SFNClient);

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

  expect(
    mockSFNClient
      .on(StartExecutionCommand, {
        input: '{"scope":"FULL","mode":"APPLY","verbose":"0"}',
        stateMachineArn: 'arn:state-machine',
      })
      .resolves({}),
  );

  expect(
    mockCodePipeline
      .on(PutJobSuccessResultCommand, {
        jobId: '0001',
      })
      .resolves({}),
  );
});

test('the State Machine execution should not be started when State Machine ARN is missing', async () => {
  // Create a valid CodePipeline event
  const event = createCodePipelineEvent({
    jobId: '0001',
    userParameters: {},
  });

  // Call the Lambda function handler
  await handler(event, { awsRequestId: 'request-0001' });

  expect(
    mockCodePipeline
      .on(PutJobFailureResultCommand, {
        jobId: '0001',
        failureDetails: {
          externalExecutionId: 'request-0001',
          message: expect.any(String),
          type: 'JobFailed',
        },
      })
      .resolves({}),
  );
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
