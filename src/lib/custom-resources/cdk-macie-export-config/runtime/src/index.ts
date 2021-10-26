import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const macie = new AWS.Macie2();

export interface HandlerProperties {
  bucketName: string;
  kmsKeyArn: string;
  keyPrefix?: string;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Configure Macie Export...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return;
  }
}

function getPhysicalId(event: CloudFormationCustomResourceEvent): string {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  return `${properties.bucketName}${properties.kmsKeyArn}${properties.keyPrefix}`;
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const response = await configExport(properties);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function configExport(properties: HandlerProperties) {
  const exportConfig = await throttlingBackOff(() =>
    macie
      .putClassificationExportConfiguration({
        configuration: {
          s3Destination: {
            bucketName: properties.bucketName,
            kmsKeyArn: properties.kmsKeyArn,
            keyPrefix: properties.keyPrefix,
          },
        },
      })
      .promise(),
  );

  return exportConfig;
}
