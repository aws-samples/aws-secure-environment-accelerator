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
  accountId: string;
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

  return `${properties.accountId}`;
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const response = await enableOrgAdmin(properties);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function enableOrgAdmin(properties: HandlerProperties) {
  try {
    const enableAdmin = await throttlingBackOff(() =>
      macie
        .enableOrganizationAdminAccount({
          adminAccountId: properties.accountId,
        })
        .promise(),
    );

    return enableAdmin;
  } catch (e) {
    const message = `${e}`;
    if (
      message.includes(
        'The request failed because an account is already enabled as the Macie delegated administrator for the organization',
      )
    ) {
      console.warn(e);
    } else {
      throw e;
    }
  }
}
