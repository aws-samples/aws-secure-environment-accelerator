import * as AWS from 'aws-sdk';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';

export enum MacieFrequency {
  FIFTEEN_MINUTES = 'FIFTEEN_MINUTES',
  ONE_HOUR = 'ONE_HOUR',
  SIX_HOURS = 'SIX_HOURS',
}

export enum MacieStatus {
  ENABLED = 'ENABLED',
  PAUSED = 'PAUSED',
}

const macie = new AWS.Macie2();

export interface HandlerProperties {
  findingPublishingFrequency: MacieFrequency;
  status: MacieStatus;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Enable Macie admin...`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
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

  return `${properties.findingPublishingFrequency}${properties.status}`;
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const response = await enableMacie(properties);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function enableMacie(properties: HandlerProperties) {
  try {
    const enableAdmin = await macie.enableMacie({
      findingPublishingFrequency: properties.findingPublishingFrequency,
      status: properties.status
    }).promise();

    return enableAdmin;
  } catch (e) {
    const message = `${e}`;
    if (message.includes('Macie has already been enabled')) {
      console.warn(e);
    } else {
      throw e;
    }
  }
}
