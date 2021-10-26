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

import { SNS } from '@aws-accelerator/common/src/aws/sns';
import { StepFunctions } from '@aws-accelerator/common/src/aws/stepfunctions';

interface NotifyErrorInput {
  error: string;
  cause: string;
  notificationTopicArn: string;
  executionId: string;
  acceleratorVersion: string;
}

const sns = new SNS();
const sfn = new StepFunctions();

export const handler = async (input: NotifyErrorInput): Promise<string> => {
  console.log('State Machine Execution Failed...');
  console.log(JSON.stringify(input, null, 2));

  const { cause, executionId, notificationTopicArn, acceleratorVersion } = input;
  let errorCause;
  try {
    errorCause = JSON.parse(cause);
  } catch (error) {
    console.warn(`Failed to convert "cause" to JSON`);
    errorCause = {
      Message: cause,
    };
  }

  const defaultReturnArguments = {
    acceleratorVersion,
    Status: 'FAILED',
  };

  // Retriving Failed State
  let failedState: string | undefined;
  try {
    failedState = await getFailedState(executionId);
  } catch (error) {
    console.error(error);
  }

  const errorCauseReturn = {
    // Adding defaultArguments in return with appropriate order
    ...defaultReturnArguments,
    // Adding Failed State
    FailedState: failedState!,
    // Rest of the error
    ...errorCause,
  };

  try {
    if (errorCauseReturn.Input) {
      console.log('Trying to convert JSON Input string to JSON object');
      errorCauseReturn.Input = JSON.parse(errorCauseReturn.Input);
    }
  } catch (error) {
    console.error('Error while converting JSON string to JSON Object');
    console.error(error.message);
  }

  console.log('Publishing Error to SNS Topic');
  console.log(JSON.stringify(errorCauseReturn, null, 2));
  await sns.publish({
    Message: JSON.stringify(errorCauseReturn),
    TopicArn: notificationTopicArn,
    Subject: 'Accelerator State Machine Failure',
  });
  return 'SUCCESS';
};

async function getFailedState(executionArn: string): Promise<string | undefined> {
  const recentEvents = await sfn.getExecutionHistory({
    executionArn,
    reverseOrder: true,
  });
  const abortEvent = recentEvents.find(e => e.type === 'TaskStateAborted');
  if (!abortEvent) {
    return;
  }
  const abortEventId = abortEvent.id;
  const checkEvents = recentEvents.filter(e => e.id < abortEventId);
  const previousStartState = checkEvents.find(e => e.type === 'TaskStateEntered');
  if (!previousStartState) {
    return;
  }
  return previousStartState.stateEnteredEventDetails?.name;
}
