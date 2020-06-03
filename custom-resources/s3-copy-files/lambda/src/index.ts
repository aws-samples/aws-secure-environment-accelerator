import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';

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

  // tslint:disable-next-line: switch-default
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
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { sourceBucketName, destinationBucketName, deleteSourceObjects, deleteSourceBucket } = properties;

  const exists = await bucketExists(sourceBucketName);
  if (exists) {
    await copyFiles({
      sourceBucketName: sourceBucketName,
      destinationBucketName: destinationBucketName,
      deleteSourceObjects: deleteSourceObjects,
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
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
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

async function copyFiles(props: {
  sourceBucketName: string;
  destinationBucketName: string;
  deleteSourceObjects: boolean;
}) {
  const { sourceBucketName, destinationBucketName, deleteSourceObjects } = props;

  const copyObjectPromises = [];
  for await (const object of listObjects(sourceBucketName)) {
    console.debug(`Copying object ${object.Key}`);
    copyObjectPromises.push(
      copyObject({
        sourceBucketName,
        destinationBucketName,
        deleteSourceObjects,
        key: object.Key!,
      }),
    );
  }
  await Promise.all(copyObjectPromises);
}

async function* listObjects(bucketName: string): AsyncIterableIterator<AWS.S3.Object> {
  let nextMarker;
  do {
    const listObjects: AWS.S3.ListObjectsOutput = await s3
      .listObjects({
        Bucket: bucketName,
        Marker: nextMarker,
      })
      .promise();
    nextMarker = listObjects.NextMarker;
    if (listObjects.Contents) {
      yield* listObjects.Contents;
    }
  } while (nextMarker);
}

async function copyObject(props: {
  sourceBucketName: string;
  destinationBucketName: string;
  deleteSourceObjects: boolean;
  key: string;
}) {
  const { sourceBucketName, destinationBucketName, deleteSourceObjects, key } = props;

  let object;
  try {
    object = await s3
      .getObject({
        Bucket: sourceBucketName,
        Key: key,
      })
      .promise();
  } catch (e) {
    throw new Error(`Unable to get S3 object s3://${sourceBucketName}/${key}: ${e}`);
  }

  try {
    await s3
      .putObject({
        Bucket: destinationBucketName,
        Key: key,
        Body: object.Body,
      })
      .promise();
  } catch (e) {
    throw new Error(`Unable to put S3 object s3://${destinationBucketName}/${key}: ${e}`);
  }

  if (deleteSourceObjects) {
    try {
      await s3
        .deleteObject({
          Bucket: sourceBucketName,
          Key: key,
        })
        .promise();
    } catch (e) {
      throw new Error(`Unable to delete S3 object s3://${sourceBucketName}/${key}: ${e}`);
    }
  }
}

async function bucketExists(bucketName: string): Promise<boolean> {
  try {
    await s3
      .headBucket({
        Bucket: bucketName,
      })
      .promise();
  } catch (e) {
    return false;
  }
  return true;
}

async function deleteBucket(bucketName: string) {
  try {
    await s3
      .deleteBucket({
        Bucket: bucketName,
      })
      .promise();
  } catch (e) {
    throw new Error(`Unable to put delete bucket s3://${bucketName}: ${e}`);
  }
}
