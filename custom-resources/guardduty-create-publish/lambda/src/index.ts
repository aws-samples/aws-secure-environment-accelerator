import * as AWS from 'aws-sdk';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';

const physicalResourceId = 'GuardDutyCreatePublishToCentralAccountS3';

const guardduty = new AWS.GuardDuty();

export interface HandlerProperties {
  destinationArn: string;
  kmsKeyArn: string;
}

export interface PublishingProps extends HandlerProperties {
  detectorId: string;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Create Guard Duty Publish destination...`);
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

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const detectorId = await getDetectorId();
  if (!detectorId) {
    console.warn(`Skipping Publishing Setup for GuardDuty as DetectorId not found`);
    return {
      physicalResourceId,
      data: {},
    };
  }
  const response = await createPublishDestination({
    ...properties,
    detectorId,
  });
  return {
    physicalResourceId,
    data: {
      DestinationId: response?.DestinationId,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const detectorId = await getDetectorId();
  if (!detectorId) {
    return {
      physicalResourceId,
      data: {},
    };
  }
  await updatePublishDestination({
    ...properties,
    detectorId,
  });
  return {
    physicalResourceId,
    data: {},
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const detectorId = await getDetectorId();
  if (!detectorId) {
    return {
      physicalResourceId,
      data: {},
    };
  }
  await deletePublishDestination({
    ...properties,
    detectorId,
  });
  return {
    physicalResourceId,
    data: {},
  };
}

async function createPublishDestination(properties: PublishingProps) {
  const { destinationArn, kmsKeyArn, detectorId } = properties;
  const params = {
    DestinationType: 'S3', // currently only S3 is supported
    DetectorId: detectorId,
    DestinationProperties: {
      DestinationArn: destinationArn,
      KmsKeyArn: kmsKeyArn,
    },
  };

  try {
    const createPublish = await guardduty.createPublishingDestination(params).promise();

    return createPublish;
  } catch (e) {
    const message = `${e}`;
    // if publish destination already exist, do not error out
    if (
      message.includes(
        `The request failed because a publishingDestination already exists with the destinationType value provided in the request`,
      )
    ) {
      console.warn(message);
    } else {
      throw e;
    }
  }
}

async function updatePublishDestination(properties: PublishingProps) {
  const listParam = {
    DetectorId: properties.detectorId,
  };
  const destination = await guardduty.listPublishingDestinations(listParam).promise();

  const params = {
    DestinationId: destination.Destinations[0].DestinationId,
    DetectorId: properties.detectorId,
    DestinationProperties: {
      DestinationArn: properties.destinationArn,
      KmsKeyArn: properties.kmsKeyArn,
    },
  };

  return guardduty.updatePublishingDestination(params).promise();
}

async function deletePublishDestination(properties: PublishingProps) {
  const destinations = await guardduty.listPublishingDestinations().promise();

  const params = {
    // only one destination should be established for guard duty
    DestinationId: destinations.Destinations[0].DestinationId,
    DetectorId: properties.detectorId,
  };

  return guardduty.deletePublishingDestination(params).promise();
}

async function getDetectorId(): Promise<string | undefined> {
  try {
    const detectors = await guardduty.listDetectors().promise();
    if (detectors.DetectorIds && detectors.DetectorIds.length > 0) {
      return detectors.DetectorIds[0];
    }
  } catch (e) {
    console.error(`Error Occured while listing Detectors ${e.code}: ${e.message}`);
    return;
  }
}
