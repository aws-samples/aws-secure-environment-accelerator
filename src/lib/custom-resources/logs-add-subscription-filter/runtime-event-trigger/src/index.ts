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

import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { throttlingBackOff, CloudWatchRulePrefix } from '@aws-accelerator/custom-resource-cfn-utils';

const logs = new AWS.CloudWatchLogs();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (input: any): Promise<string> => {
  console.log(`Add Subscription to point LogDestination in log-archive account...`);
  console.log(JSON.stringify(input, null, 2));

  const logGroupName = input.detail.requestParameters.logGroupName as string;
  const logDestinationArn = process.env.LOG_DESTINATION;
  if (!logDestinationArn) {
    console.warn(`Log Destination is not parent in env for this account`);
    const newLocal = `Log Destination is not parent in env for this account`;
    return newLocal;
  }
  let exclusions: string[] = [];
  if (process.env.EXCLUSIONS) {
    try {
      exclusions = JSON.parse(process.env.EXCLUSIONS);
    } catch (error) {
      console.warn(error.message);
    }
  }
  if (isExcluded(exclusions, logGroupName)) {
    return `No Need of Subscription Filter for "${logGroupName}"`;
  }
  await addSubscriptionFilter(logGroupName, logDestinationArn);
  const logRetention = process.env.LOG_RETENTION;
  if (logRetention) {
    // Update Log Retention Policy
    await putLogRetentionPolicy(logGroupName, Number(logRetention));
  }
  return 'SUCCESS';
};

async function addSubscriptionFilter(logGroupName: string, destinationArn: string) {
  // Adding subscription filter
  await throttlingBackOff(() =>
    logs
      .putSubscriptionFilter({
        destinationArn,
        logGroupName,
        filterName: `${CloudWatchRulePrefix}${logGroupName}`,
        filterPattern: '',
      })
      .promise(),
  );
}

const isExcluded = (exclusions: string[], logGroupName: string): boolean => {
  for (const exclusion of exclusions || []) {
    if (exclusion.endsWith('*') && logGroupName.startsWith(exclusion.slice(0, -1))) {
      return true;
    } else if (logGroupName === exclusion) {
      return true;
    }
  }
  return false;
};

async function putLogRetentionPolicy(logGroupName: string, retentionInDays: number) {
  try {
    await throttlingBackOff(() =>
      logs
        .putRetentionPolicy({
          logGroupName,
          retentionInDays,
        })
        .promise(),
    );
  } catch (error) {
    console.error(`Error while updating retention policy on "${logGroupName}": ${error.message}`);
  }
}
