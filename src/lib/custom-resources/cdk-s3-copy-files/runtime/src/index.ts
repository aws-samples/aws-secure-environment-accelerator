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
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  sourceBucketName: string;
  destinationBucketName: string;
  deleteSourceObjects: boolean;
  deleteSourceBucket: boolean;
  forceUpdate?: number;
}

const s3 = new AWS.S3();

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Copying S3 objects...`);
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

export const handler = errorHandler(onEvent);

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const properties = getPropertiesFromEvent(event);
  const { sourceBucketName, destinationBucketName, deleteSourceObjects, deleteSourceBucket } = properties;

  const exists = await bucketExists(sourceBucketName);
  if (exists) {
    await copyFiles({
      sourceBucketName,
      destinationBucketName,
      deleteSourceObjects,
    });
    if (deleteSourceBucket) {
      console.debug(`Deleting bucket ${sourceBucketName}`);
      await deleteBucket(sourceBucketName);
    }
  }
  return {
    physicalResourceId: destinationBucketName,
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  const properties = getPropertiesFromEvent(event);
  // Only copy over the files when forceUpdate is not set
  if (properties.forceUpdate !== undefined) {
    return onCreate(event);
  }
  return {
    physicalResourceId: properties.destinationBucketName,
  };
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

function getPropertiesFromEvent(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  if (typeof properties.deleteSourceObjects === 'string') {
    properties.deleteSourceObjects = properties.deleteSourceObjects === 'true';
  }
  if (typeof properties.deleteSourceBucket === 'string') {
    properties.deleteSourceBucket = properties.deleteSourceBucket === 'true';
  }
  return properties;
}

async function copyFiles(props: {
  sourceBucketName: string;
  destinationBucketName: string;
  deleteSourceObjects: boolean;
}) {
  const { sourceBucketName, destinationBucketName, deleteSourceObjects } = props;

  const copyObjectPromises = [];
  for await (const object of listObjects(sourceBucketName)) {
    if (object.Key!.endsWith('/')) {
      console.debug(`Skipping directory ${object.Key}`);
      continue;
    }

    console.debug(`Copying object ${object.Key}`);
    copyObjectPromises.push(
      copyObject({
        sourceBucketName,
        destinationBucketName,
        deleteSourceObjects,
        sourceObject: object,
      }),
    );
  }
  await Promise.all(copyObjectPromises);
}

async function* listObjects(bucketName: string): AsyncIterableIterator<AWS.S3.Object> {
  let nextContinuationToken: string | undefined;
  do {
    const listObjects: AWS.S3.ListObjectsV2Output = await throttlingBackOff(() =>
      s3
        .listObjectsV2({
          Bucket: bucketName,
          ContinuationToken: nextContinuationToken,
        })
        .promise(),
    );
    nextContinuationToken = listObjects.NextContinuationToken;
    if (listObjects.Contents) {
      yield* listObjects.Contents;
    }
  } while (nextContinuationToken);
}

async function copyObject(props: {
  sourceBucketName: string;
  destinationBucketName: string;
  deleteSourceObjects: boolean;
  sourceObject: AWS.S3.Object;
}) {
  const { sourceBucketName, destinationBucketName, deleteSourceObjects, sourceObject } = props;
  const sourceKey = sourceObject.Key!;

  let object: AWS.S3.GetObjectOutput;
  try {
    object = await throttlingBackOff(() =>
      s3
        .getObject({
          Bucket: sourceBucketName,
          Key: sourceKey,
        })
        .promise(),
    );
  } catch (e) {
    throw new Error(`Unable to get S3 object s3://${sourceBucketName}/${sourceKey}: ${e}`);
  }

  try {
    await throttlingBackOff(() =>
      s3
        .putObject({
          Bucket: destinationBucketName,
          Key: sourceKey,
          Body: object.Body,
        })
        .promise(),
    );
  } catch (e) {
    throw new Error(`Unable to put S3 object s3://${destinationBucketName}/${sourceKey}: ${e}`);
  }

  if (deleteSourceObjects) {
    try {
      await throttlingBackOff(() =>
        s3
          .deleteObject({
            Bucket: sourceBucketName,
            Key: sourceKey,
          })
          .promise(),
      );
    } catch (e) {
      throw new Error(`Unable to delete S3 object s3://${sourceBucketName}/${sourceKey}: ${e}`);
    }
  }
}

async function bucketExists(bucketName: string): Promise<boolean> {
  try {
    await throttlingBackOff(() =>
      s3
        .headBucket({
          Bucket: bucketName,
        })
        .promise(),
    );
  } catch (e) {
    return false;
  }
  return true;
}

async function deleteBucket(bucketName: string) {
  try {
    await throttlingBackOff(() =>
      s3
        .deleteBucket({
          Bucket: bucketName,
        })
        .promise(),
    );
  } catch (e) {
    console.warn(`Unable to delete bucket s3://${bucketName}: ${e}`);
  }
}

function compareDate(a: Date, b: Date) {
  return a.getTime() - b.getTime();
}
