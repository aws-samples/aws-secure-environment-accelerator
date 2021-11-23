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
import * as AWS from 'aws-sdk';

const logGroupName = process.env.LOG_GROUP_NAME || '';

const cloudWatchLogs = new AWS.CloudWatchLogs();

export const handler = async (input: any, context?: Context): Promise<void> => {
  console.log('EventBridge CloudWatch Logs Publisher ....');
  console.log(JSON.stringify(input, null, 2));

  console.log(`Publishing to ${logGroupName}`);
  if (logGroupName) {
    const logStreamName = `${new Date().toISOString().slice(0, 10)}`;

    let uploadSequenceToken: string | undefined;

    try {
      const existingLogStream = await cloudWatchLogs
        .describeLogStreams({
          logGroupName,
          logStreamNamePrefix: logStreamName,
        })
        .promise();

      if (existingLogStream.logStreams && existingLogStream.logStreams.length > 0) {
        uploadSequenceToken = existingLogStream.logStreams[0].uploadSequenceToken;
      } else {
        await cloudWatchLogs
          .createLogStream({
            logGroupName,
            logStreamName,
          })
          .promise();
      }
    } catch (err: any) {
      if (err.message !== 'The specified log stream already exists') {
        throw err;
      }
    }

    await cloudWatchLogs
      .putLogEvents({
        logGroupName,
        logStreamName,
        sequenceToken: uploadSequenceToken,
        logEvents: [
          {
            timestamp: Date.now(),
            message: JSON.stringify(input),
          },
        ],
      })
      .promise();
  }
};
