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

import { Context } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const logGroupName = process.env.LOG_GROUP_NAME || '';

const cloudWatchLogs = new AWS.CloudWatchLogs();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (input: any, context?: Context): Promise<void> => {
  console.log('EventBridge CloudWatch Logs Publisher ....');
  console.log(JSON.stringify(input, null, 2));

  console.log(`Publishing to ${logGroupName}`);
  if (logGroupName) {
    const logStreamName = `${new Date().toISOString().slice(0, 10)}-${uuidv4()}`;

    await throttlingBackOff(() =>
      cloudWatchLogs
        .createLogStream({
          logGroupName,
          logStreamName,
        })
        .promise(),
    );

    await throttlingBackOff(() =>
      cloudWatchLogs
        .putLogEvents({
          logGroupName,
          logStreamName,
          logEvents: [
            {
              timestamp: Date.now(),
              message: JSON.stringify(input),
            },
          ],
        })
        .promise(),
    );
  } else {
    console.log(`LogGroupName not specified`);
  }
};
