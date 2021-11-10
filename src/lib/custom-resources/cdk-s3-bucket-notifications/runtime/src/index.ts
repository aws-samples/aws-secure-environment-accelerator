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
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const s3 = new AWS.S3();
const sts = new AWS.STS();

export interface HandlerProperties {
  s3EventName: string;
  bucketName: string;
  lambdaArn: string;
  s3Events: string[];
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`S3 Bucket Notifications...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

function getPhysicalId(event: CloudFormationCustomResourceEvent): string {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  return `S3BucketNotifications-${properties.bucketName}`;
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { bucketName, lambdaArn, s3Events, s3EventName } = properties;

  const existingNotifcationConfiguration = await throttlingBackOff(() =>
    s3
      .getBucketNotificationConfiguration({
        Bucket: bucketName,
      })
      .promise(),
  );

  console.log(existingNotifcationConfiguration);

  let lambdaConfigurations = existingNotifcationConfiguration.LambdaFunctionConfigurations ?? [];
  const foundIndex = lambdaConfigurations.findIndex(x => x.Id === s3EventName);

  if (foundIndex > -1) {
    lambdaConfigurations = foundIndex == 0 ? [] : lambdaConfigurations.splice(foundIndex, 1);
  }
  lambdaConfigurations.push({
    Id: s3EventName,
    LambdaFunctionArn: lambdaArn,
    Events: s3Events,
  });
  existingNotifcationConfiguration.LambdaFunctionConfigurations = lambdaConfigurations;

  await throttlingBackOff(() =>
    s3
      .putBucketNotificationConfiguration({
        Bucket: bucketName,
        NotificationConfiguration: existingNotifcationConfiguration,
      })
      .promise(),
  );

  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { bucketName, s3EventName } = properties;
  if (event.PhysicalResourceId !== getPhysicalId(event)) {
    return;
  }

  const existingNotifcationConfiguration = await throttlingBackOff(() =>
    s3
      .getBucketNotificationConfiguration({
        Bucket: bucketName,
      })
      .promise(),
  );

  console.log(existingNotifcationConfiguration);

  let lambdaConfigurations = existingNotifcationConfiguration.LambdaFunctionConfigurations ?? [];
  const foundIndex = lambdaConfigurations.findIndex(x => x.Id === s3EventName);

  if (foundIndex > -1) {
    lambdaConfigurations = foundIndex == 0 ? [] : lambdaConfigurations.splice(foundIndex, 1);
  }
  existingNotifcationConfiguration.LambdaFunctionConfigurations = lambdaConfigurations;

  await throttlingBackOff(() =>
    s3
      .putBucketNotificationConfiguration({
        Bucket: bucketName,
        NotificationConfiguration: existingNotifcationConfiguration,
      })
      .promise(),
  );
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}
