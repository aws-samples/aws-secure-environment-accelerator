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

import { ScheduledEvent } from 'aws-lambda';
import { getInvoker } from './../utils';

interface InvocationCheckInput {
  scheduledEvent: ScheduledEvent;
  acceleratorRoleName: string;
}

export const handler = async (input: InvocationCheckInput) => {
  console.log(`Invocation Check for CreateAccount Event...`);
  console.log(JSON.stringify(input, null, 2));
  const { acceleratorRoleName, scheduledEvent } = input;
  const invokedBy = getInvoker(input.scheduledEvent);
  if (invokedBy && invokedBy === acceleratorRoleName) {
    console.log(`Create Account Performed by Accelerator, No operation required`);
    return true;
  }

  return false;
};
