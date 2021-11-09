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
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const hub = new AWS.SecurityHub();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Sending Security Hub Invites to Sub Accounts...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const memberAccounts = event.ResourceProperties.memberAccounts;

  // Creating Members
  console.log(`Creating Members for "${memberAccounts}"`);
  const accountIds: string[] = [];

  // Security Hub will only process 50.
  const pageSize = 50;
  for (let i = 0; i < memberAccounts.length; i += pageSize) {
    const currentPage = memberAccounts.slice().splice(i, pageSize);
    const pagedMemberParams = {
      AccountDetails: currentPage,
    };
    console.log(`Creating Members (paged) for "${pagedMemberParams}"`);
    const createResponse = await throttlingBackOff(() => hub.createMembers(pagedMemberParams).promise());
    console.log(`Create Sub Accounts Response "${JSON.stringify(createResponse)}""`);
    for (const account of currentPage) {
      accountIds.push(account.AccountId);
    }
  }

  console.log(`Inviting Members for "${accountIds}"`);

  // Security Hub will only process 50.
  for (let i = 0; i < accountIds.length; i += pageSize) {
    const currentPage = accountIds.slice().splice(i, pageSize);
    const pagedParams = {
      AccountIds: currentPage,
    };
    console.log(`Inviting Members (paged) for "${pagedParams}"`);
    const inviteResponse = await throttlingBackOff(() => hub.inviteMembers(pagedParams).promise());
    console.log(`Invite Sub Accounts Response "${JSON.stringify(inviteResponse)}"`);
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
