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

export interface HandlerProperties {
  bucketName: string;
  logRetention?: number;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`S3 Put Bucket Versioning...`);
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
  return `S3PutBucketVersioning-${properties.bucketName}`;
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { bucketName, logRetention } = properties;
  await throttlingBackOff(() =>
    s3
      .putBucketVersioning({
        Bucket: bucketName,
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      })
      .promise(),
  );

  if (!logRetention) {
    return;
  }

  await throttlingBackOff(() =>
    s3
      .putBucketLifecycleConfiguration({
        Bucket: bucketName,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: `S3LifeCycle`,
              Status: 'Enabled',
              Prefix: '',
              AbortIncompleteMultipartUpload: {
                DaysAfterInitiation: 7,
              },
              Expiration: {
                Days: Number(logRetention),
              },
              NoncurrentVersionExpiration: {
                NoncurrentDays: Number(logRetention),
              },
            },
          ],
        },
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
  const { bucketName, logRetention } = properties;
  if (event.PhysicalResourceId !== getPhysicalId(event)) {
    return;
  }

  if (logRetention) {
    await throttlingBackOff(() =>
      s3
        .putBucketLifecycleConfiguration({
          Bucket: bucketName,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: `S3LifeCycle`,
                Status: 'Enabled',
                Prefix: '',
                AbortIncompleteMultipartUpload: {
                  DaysAfterInitiation: 7,
                },
                Expiration: {
                  Days: Number(logRetention),
                },
              },
            ],
          },
        })
        .promise(),
    );
  }

  await throttlingBackOff(() =>
    s3
      .putBucketVersioning({
        Bucket: bucketName,
        VersioningConfiguration: {
          Status: 'Suspended',
        },
      })
      .promise(),
  );
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}
