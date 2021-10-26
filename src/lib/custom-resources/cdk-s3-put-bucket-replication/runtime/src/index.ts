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
import { ReplicationRules } from 'aws-sdk/clients/s3';

const s3 = new AWS.S3();

export interface HandlerProperties {
  bucketName: string;
  replicationRole: string;
  rules: ReplicationRules;
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
  const { bucketName } = properties;
  if (event.PhysicalResourceId !== getPhysicalId(event)) {
    return;
  }
  await throttlingBackOff(() =>
    s3
      .deleteBucketReplication({
        Bucket: bucketName,
      })
      .promise(),
  );
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}
