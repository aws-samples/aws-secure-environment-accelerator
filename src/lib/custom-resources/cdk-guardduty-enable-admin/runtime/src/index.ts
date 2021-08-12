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

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const accountId = event.ResourceProperties.accountId;
  const sleepTime = 30000;
  const retryCount = 10;
  await enableOrgAdmin(accountId);
  let guardDutyAdminEnabled = await isGuardDutyAdminEnabled(accountId);
  let retries = 0;
  while (!guardDutyAdminEnabled && retries < retryCount) {
    console.log(
      `GuardDuty Admin not enabled. Retrying in ${sleepTime / 1000} seconds. Retry: ${retries + 1} of ${retryCount}`,
    );
    await sleep(sleepTime);
    await enableOrgAdmin(accountId);
    guardDutyAdminEnabled = await isGuardDutyAdminEnabled(accountId);
    retries++;
  }
  return {
    physicalResourceId: event.ResourceProperties.accountId,
    data: {},
  };
}
async function isGuardDutyAdminEnabled(accountId: string) {
  console.log(`Checking if GuardDuty Administration is enabled for account ${accountId}`);
  const adminList = await guardduty.listOrganizationAdminAccounts().promise();
  console.log(adminList);
  const isAccountAdded = adminList.AdminAccounts?.filter(account => {
    return account.AdminAccountId === accountId;
  });

  if (isAccountAdded!.length === 0) {
    console.log('Account has not been added.');
  } else {
    console.log('Account has been added.');
  }
  return isAccountAdded!.length > 0;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enableOrgAdmin(accountId: string) {
  const params = {
    AdminAccountId: accountId,
  };

  try {
    console.log(`Enabling GuardDuty Admin for account ${accountId}`);
    const enableAdmin = await guardduty.enableOrganizationAdminAccount(params).promise();
    console.log(enableAdmin);
    return enableAdmin;
  } catch (e) {
    console.log('Could not enable Guard Duty Admin.');
    console.log(e);
  }
}
