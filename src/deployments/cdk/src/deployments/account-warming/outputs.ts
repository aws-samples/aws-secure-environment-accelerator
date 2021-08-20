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

import * as t from 'io-ts';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { StructuredOutput } from '../../common/structured-output';

export const InstanceTimeOutputType = t.interface(
  {
    instanceId: t.string,
    time: t.string,
  },
  'InstanceTime',
);

export type InstanceStatusOutput = t.TypeOf<typeof InstanceTimeOutputType>;

export function getTimeDiffInMinutes(instanceLaunchTime: string): number {
  // converting instance launch time into milliseconds
  const instanceLaunchTimeInMill = Date.parse(instanceLaunchTime);

  // getting the UTC date from current time
  const utcDateInString = new Date().toISOString();

  // converting current UTC date into milliseconds
  const utcCurrentTimeInMill = Date.parse(utcDateInString);

  // calculating the time in minutes
  const minutes = Math.floor((utcCurrentTimeInMill - instanceLaunchTimeInMill) / (1000 * 60));
  return minutes;
}

export function checkAccountWarming(
  accountKey: string,
  outputs: StackOutput[],
): {
  accountWarmed: boolean;
  timeLeft?: number;
} {
  const instanceTimeOutputs = StructuredOutput.fromOutputs(outputs, {
    type: InstanceTimeOutputType,
    accountKey,
  });
  if (!instanceTimeOutputs || instanceTimeOutputs.length === 0) {
    console.warn(`Cannot find InstanceOutput for account ${accountKey}`);
    return {
      accountWarmed: false,
    };
  } else {
    const differenceTime = getTimeDiffInMinutes(instanceTimeOutputs[0].time);
    if (differenceTime < 15) {
      console.warn(`Minimum 15 minutes of account warming required for account ${accountKey}`);
      return {
        accountWarmed: false,
        timeLeft: 15 - differenceTime,
      };
    }
  }
  return {
    accountWarmed: true,
  };
}
