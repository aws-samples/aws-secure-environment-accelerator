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

const macie = new AWS.Macie2();

export interface HandlerProperties {
  accountId: string;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Enable Macie admin...`);
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

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const accountId = event.ResourceProperties.accountId;
  const sleepTime = 30000;
  const retryCount = 10;
  await enableOrgAdmin(accountId);
  let macieAdminEnabled = await isMacieAdminEnabled(accountId);
  let retries = 0;
  while (!macieAdminEnabled && retries < retryCount) {
    console.warn(
      `Macie Admin not enabled. Retrying in ${sleepTime / 1000} seconds. Retry: ${retries + 1} of ${retryCount}`,
    );
    await sleep(sleepTime);
    await enableOrgAdmin(accountId);
    macieAdminEnabled = await isMacieAdminEnabled(accountId);
    retries++;
  }
  return {
    physicalResourceId: accountId,
    data: {},
  };
}

async function isMacieAdminEnabled(accountId: string) {
  console.log(`Checking if Macie Administration is enabled for account ${accountId}`);
  const adminList = await macie.listOrganizationAdminAccounts().promise();
  const isAccountAdded = adminList.adminAccounts?.filter(account => {
    return account.accountId === accountId;
  });
  if (isAccountAdded!.length === 0) {
    console.log('Account has not been added.');
  } else {
    console.log('Account has been added.');
  }
  return isAccountAdded!.length > 0;
}

async function enableOrgAdmin(accountId: string) {
  console.info(`Enabling Macie Admin Account ${accountId}`);
  try {
    const macieAdmin = await macie
      .enableOrganizationAdminAccount({
        adminAccountId: accountId,
      })
      .promise();
    console.info(macieAdmin);
  } catch (e) {
    console.warn('Could not enable Macie Admin account');
    console.warn(e);
    return;
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
