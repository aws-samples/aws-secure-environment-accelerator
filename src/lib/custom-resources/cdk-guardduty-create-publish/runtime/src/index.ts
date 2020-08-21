import * as AWS from 'aws-sdk';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

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
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

function getPhysicalId(event: CloudFormationCustomResourceEvent): string {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  return `${properties.detectorId}${properties.destinationArn}${properties.kmsKeyArn}`;
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  await deletePublishDestination(properties);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { detectorId } = properties;
  if (detectorId === 'NotFound') {
    console.warn(`DetecrorId Not Found, Skipping creation of publisher`);
    return {
      physicalResourceId: getPhysicalId(event),
      data: {},
    };
  }
  const response = await createOrUpdatePublishDestination({
    ...properties,
    detectorId,
  });
  return {
    physicalResourceId: getPhysicalId(event),
    data: {
      DestinationId: response?.DestinationId,
    },
  };
}

async function createOrUpdatePublishDestination(properties: HandlerProperties) {
  const { destinationArn, kmsKeyArn, detectorId } = properties;
  try {
    const destination = await throttlingBackOff(() =>
      guardduty
        .listPublishingDestinations({
          DetectorId: detectorId,
        })
        .promise(),
    );

    if (destination.Destinations && destination.Destinations.length > 0) {
      const updateParams = {
        DestinationId: destination.Destinations[0].DestinationId,
        DetectorId: properties.detectorId,
        DestinationProperties: {
          DestinationArn: properties.destinationArn,
          KmsKeyArn: properties.kmsKeyArn,
        },
      };
      await throttlingBackOff(() => guardduty.updatePublishingDestination(updateParams).promise());
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

      const createPublish = await throttlingBackOff(() =>
        guardduty.createPublishingDestination(createParams).promise(),
      );
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

async function deletePublishDestination(properties: HandlerProperties) {
  const { detectorId } = properties;
  if (detectorId === 'NotFound') {
    console.warn(`DetecrorId Not Found, Skipping creation of publisher`);
    return;
  }
  try {
    const destinations = await throttlingBackOff(() =>
      guardduty
        .listPublishingDestinations({
          DetectorId: detectorId,
        })
        .promise(),
    );

    const params = {
      // only one destination should be established for guard duty
      DestinationId: destinations.Destinations[0].DestinationId,
      DetectorId: properties.detectorId,
    };

    return await throttlingBackOff(() => guardduty.deletePublishingDestination(params).promise());
  } catch (error) {
    console.error(error);
    return;
  }
}
