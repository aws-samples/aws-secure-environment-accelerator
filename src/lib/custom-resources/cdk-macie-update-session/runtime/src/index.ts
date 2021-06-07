import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { MacieFrequency, MacieStatus } from '@aws-accelerator/custom-resource-macie-enable-runtime';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const macie = new AWS.Macie2();

export interface HandlerProperties {
  findingPublishingFrequency: MacieFrequency;
  status: MacieStatus;
  publishSensitiveFindings: boolean;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Configure Macie Session...`);
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

  return `MacieUpdateSession${properties.findingPublishingFrequency}${properties.status}`;
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = getPropertiesFromEvent(event);
  const response = await configSession(properties);
  await updatePublishConfiguration(properties.publishSensitiveFindings);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function configSession(properties: HandlerProperties) {
  const updateSession = await throttlingBackOff(() =>
    macie
      .updateMacieSession({
        findingPublishingFrequency: properties.findingPublishingFrequency,
        status: properties.status,
      })
      .promise(),
  );
  return updateSession;
}

async function updatePublishConfiguration(enableSensitiveData: boolean) {
  await throttlingBackOff(() =>
    macie
      .putFindingsPublicationConfiguration({
        securityHubConfiguration: {
          publishClassificationFindings: enableSensitiveData,
          publishPolicyFindings: true,
        },
      })
      .promise(),
  );
}

function getPropertiesFromEvent(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  if (typeof properties.publishSensitiveFindings === 'string') {
    properties.publishSensitiveFindings = properties.publishSensitiveFindings === 'true';
  }
  return properties;
}
