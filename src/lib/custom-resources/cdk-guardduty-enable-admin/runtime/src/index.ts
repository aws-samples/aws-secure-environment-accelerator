import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const guardduty = new AWS.GuardDuty();

export interface HandlerProperties {
  accountId: string;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Enable Guard Duty Admin...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
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
  const params = {
    AdminAccountId: properties.accountId,
  };

  try {
    const enableAdmin = await throttlingBackOff(() => guardduty.enableOrganizationAdminAccount(params).promise());

    return enableAdmin;
  } catch (e) {
    const message = `${e}`;
    // if account is already enabled as delegated admin, do not error out
    if (
      message.includes(`the account is already enabled as the GuardDuty delegated administrator for the organization`)
    ) {
      console.warn(message);
    } else {
      throw e;
    }
  }
}
