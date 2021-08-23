/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

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
