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
  autoEnable: boolean;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Configure Macie autoEnable...`);
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
  return `UpdateOrganizationConfiguration`;
}

function getPropertiesFromEvent(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  if (typeof properties.autoEnable === 'string') {
    properties.autoEnable = properties.autoEnable === 'true';
  }
  return properties;
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = getPropertiesFromEvent(event);
  const response = await configExport(properties);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function configExport(properties: HandlerProperties) {
  const updateConfig = await throttlingBackOff(() =>
    macie
      .updateOrganizationConfiguration({
        autoEnable: properties.autoEnable,
      })
      .promise(),
  );

  return updateConfig;
}
