import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';

export interface HandlerProperties {
  sourceBucketName: string;
  destinationBucketName: string;
}

const cfn = new AWS.CloudFormation();
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
  await copyFiles({
    sourceBucketName: properties.sourceBucketName,
    destinationBucketName: properties.destinationBucketName,
  });
  return {
    physicalResourceId: properties.destinationBucketName,
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  // Find resource last updated timestamp
  const describeStackResource = await cfn
    .describeStackResource({
      StackName: event.StackId,
      LogicalResourceId: event.LogicalResourceId,
    })
    .promise();
  const lastUpdatedTimestamp = describeStackResource.StackResourceDetail?.LastUpdatedTimestamp;
  console.debug(`Resource last updated timestamp ${lastUpdatedTimestamp}`);

  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  return copyFiles({
    sourceBucketName: properties.sourceBucketName,
    destinationBucketName: properties.destinationBucketName,
    resourceLastModified: lastUpdatedTimestamp,
  });
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

async function copyFiles(props: {
  sourceBucketName: string;
  destinationBucketName: string;
  resourceLastModified?: Date;
}) {
  const { sourceBucketName, destinationBucketName, resourceLastModified } = props;

  const copyObjectPromises = [];
  for await (const object of listObjects(sourceBucketName)) {
    const objectLastModified = object.LastModified!;
    if (resourceLastModified && resourceLastModified.getTime() < objectLastModified.getTime()) {
      console.debug(`Skipping object ${object.Key}`);
      console.debug(`  Object last modified ${objectLastModified} is before resource ${resourceLastModified}`);
      continue;
    }

    console.debug(`Copying object ${object.Key}, last modified at ${objectLastModified}`);
    copyObjectPromises.push(
      copyObject({
        sourceBucketName,
        destinationBucketName,
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

async function copyObject(props: { sourceBucketName: string; destinationBucketName: string; key: string }) {
  const { sourceBucketName, destinationBucketName, key } = props;

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
}
