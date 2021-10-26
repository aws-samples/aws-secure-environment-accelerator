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
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceCreateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  snsRoleArn: string;
  topicArn: string;
}

const physicalResourceId = `FMS-Notification-Channel`;
const fms = new AWS.FMS();
export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`FMS Notification Channel..`);
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

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { snsRoleArn, topicArn } = properties;
  await throttlingBackOff(() =>
    fms
      .putNotificationChannel({
        SnsRoleName: snsRoleArn,
        SnsTopicArn: topicArn,
      })
      .promise(),
  );
  return {
    physicalResourceId,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { snsRoleArn, topicArn } = properties;
  await throttlingBackOff(() => fms.deleteNotificationChannel().promise());
  await throttlingBackOff(() =>
    fms
      .putNotificationChannel({
        SnsRoleName: snsRoleArn,
        SnsTopicArn: topicArn,
      })
      .promise(),
  );
  return {
    physicalResourceId,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting FMS Notification channel...`);
  console.log(JSON.stringify(event, null, 2));
  if (event.PhysicalResourceId !== physicalResourceId) {
    return {
      physicalResourceId,
    };
  }
  await throttlingBackOff(() => fms.deleteNotificationChannel().promise());
  return {
    physicalResourceId,
  };
}
