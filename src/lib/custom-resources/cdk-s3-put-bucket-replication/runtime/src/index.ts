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
import { ReplicationRule, S3 } from '@aws-sdk/client-s3';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const s3 = new S3({
  logger: console,
});

export interface HandlerProperties {
  bucketName: string;
  replicationRole: string;
  rules: Array<ReplicationRule>;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`S3 Put Replication...`);
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
  return `S3PutReplication-${properties.bucketName}`;
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { bucketName, replicationRole, rules } = properties;
  await throttlingBackOff(() =>
    s3
      .putBucketReplication({
        Bucket: bucketName,
        ReplicationConfiguration: {
          Role: replicationRole,
          Rules: rules,
        },
      }),
  );
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { bucketName } = properties;
  if (event.PhysicalResourceId !== getPhysicalId(event)) {
    return;
  }
  await throttlingBackOff(() =>
    s3
      .deleteBucketReplication({
        Bucket: bucketName,
      }),
  );
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}
