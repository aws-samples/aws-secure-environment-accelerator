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
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const detectorId = await getDetectorId();
  if (!detectorId) {
    console.warn(`Skipping Publishing Setup for GuardDuty as DetectorId not found`);
    return {
      physicalResourceId,
      data: {},
    };
  }
  const response = await createOrUpdatePublishDestination({
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

async function createOrUpdatePublishDestination(properties: PublishingProps) {
  const { destinationArn, kmsKeyArn, detectorId } = properties;
  try {
    const destination = await guardduty
      .listPublishingDestinations({
        DetectorId: detectorId,
      })
      .promise();

    if (destination.Destinations && destination.Destinations.length > 0) {
      const updateParams = {
        DestinationId: destination.Destinations[0].DestinationId,
        DetectorId: properties.detectorId,
        DestinationProperties: {
          DestinationArn: properties.destinationArn,
          KmsKeyArn: properties.kmsKeyArn,
        },
      };
      await guardduty.updatePublishingDestination(updateParams).promise();
      return destination.Destinations[0];
    } else {
      const createParams = {
        DestinationType: 'S3', // currently only S3 is supported
        DetectorId: detectorId,
        DestinationProperties: {
          DestinationArn: destinationArn,
          KmsKeyArn: kmsKeyArn,
        },
      };

      const createPublish = await guardduty.createPublishingDestination(createParams).promise();
      console.log(`Created Publishing Destination for detectorId "${detectorId}"`);
      return createPublish;
    }
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
