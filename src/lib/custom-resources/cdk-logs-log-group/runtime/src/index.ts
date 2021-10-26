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
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export type Tags = AWS.CloudWatchLogs.Tags;

export interface HandlerProperties {
  logGroupName: string;
  retention?: number;
  tags?: Tags;
  kmsKeyId?: string;
}

export const handler = errorHandler(onEvent);

const logs = new AWS.CloudWatchLogs();

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Creating log group...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { logGroupName, retention, tags, kmsKeyId } = properties;
  try {
    const existingLogGroups = await throttlingBackOff(() =>
      logs
        .describeLogGroups({
          logGroupNamePrefix: logGroupName,
        })
        .promise(),
    );
    const existingLogGroup = existingLogGroups.logGroups?.find(lg => lg.logGroupName === logGroupName);
    if (existingLogGroup) {
      console.warn(`Log Group is already exists : ${logGroupName}`);
      if (kmsKeyId) {
        // Add kmsKeyId to logGroup
        await throttlingBackOff(() =>
          logs
            .associateKmsKey({
              kmsKeyId,
              logGroupName,
            })
            .promise(),
        );
      }
    } else {
      await throttlingBackOff(() =>
        logs
          .createLogGroup({
            logGroupName,
            tags,
            kmsKeyId,
          })
          .promise(),
      );
    }
  } catch (e) {
    throw new Error(`Cannot create log group: ${JSON.stringify(e)}`);
  }
  try {
    if (!retention) {
      await throttlingBackOff(() =>
        logs
          .deleteRetentionPolicy({
            logGroupName,
          })
          .promise(),
      );
    } else {
      await throttlingBackOff(() =>
        logs
          .putRetentionPolicy({
            logGroupName,
            retentionInDays: retention,
          })
          .promise(),
      );
    }
  } catch (e) {
    throw new Error(`Cannot put log group retention: ${JSON.stringify(e)}`);
  }
  return {
    physicalResourceId: logGroupName,
    data: {
      LogGroupName: logGroupName,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting CloudWatch LogGroup ...`);
  console.log(JSON.stringify(event, null, 2));
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { logGroupName } = properties;
  if (event.PhysicalResourceId !== logGroupName) {
    return;
  }

  // Delete CloudWatch loggroup
  await throttlingBackOff(() =>
    logs
      .deleteLogGroup({
        logGroupName,
      })
      .promise(),
  );
}
