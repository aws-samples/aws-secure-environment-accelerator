import * as AWS from 'aws-sdk';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
} from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';

const guardduty = new AWS.GuardDuty();

export interface HandlerProperties {
  detectorId: string;
  destinationArn: string;
  kmsKeyArn: string;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Create Guard Duty Publish destination...`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
  }
}

function getPhysicalId(event: CloudFormationCustomResourceEvent): string {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  return `${properties.detectorId}${properties.destinationArn}${properties.kmsKeyArn}`;
}

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const response = await createPublishDestination(properties);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function createPublishDestination(properties: HandlerProperties) {
  const params = {
    DestinationType: 'S3',
    DetectorId: properties.detectorId,
    DestinationProperties: {
      DestinationArn: properties.destinationArn,
      KmsKeyArn: properties.kmsKeyArn,
    },
  };

  try {
    const createPublish = await guardduty.createPublishingDestination(params).promise();

    return createPublish;
  } catch (e) {
    const message = `${e}`;
    // if publish destination already exist, do not error out
    if (
      message.includes(`The request failed because a publishingDestination already exists with the destinationType value provided in the request`)
    ) {
      console.warn(message);
    } else {
      throw e;
    }
  }
}
