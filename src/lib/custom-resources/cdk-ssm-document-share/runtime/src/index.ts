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
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff, paginate } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  name: string;
  accountIds: string[];
}

// SSM modifyDocumentPermission api only supports max 20 accounts per request
const pageSize = 20;
const ssm = new AWS.SSM();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`SSM Document Share...`);
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

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const { accountIds, name } = (event.ResourceProperties as unknown) as HandlerProperties;
  let pageNumber = 1;
  let currentAccountIds: string[] = paginate(accountIds, pageNumber, pageSize);
  while (currentAccountIds.length > 0) {
    await throttlingBackOff(() =>
      ssm
        .modifyDocumentPermission({
          Name: name,
          PermissionType: 'Share',
          AccountIdsToAdd: currentAccountIds,
        })
        .promise(),
    );
    currentAccountIds = paginate(accountIds, ++pageNumber, pageSize);
  }

  return {
    physicalResourceId: `SSMDocumentShare-${name}`,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  console.log(`SSM Document Share Update...`);
  console.log(JSON.stringify(event, null, 2));
  const { accountIds, name } = (event.ResourceProperties as unknown) as HandlerProperties;
  const oldProperties = (event.OldResourceProperties as unknown) as HandlerProperties;
  const shareAccounts = accountIds.filter(accountId => !oldProperties.accountIds.includes(accountId));
  const unShareAccounts = oldProperties.accountIds.filter(accountId => !accountIds.includes(accountId));

  if (shareAccounts.length > 0) {
    let pageNumber = 1;
    let currentAccountIds: string[] = paginate(shareAccounts, pageNumber, pageSize);
    while (currentAccountIds.length > 0) {
      await throttlingBackOff(() =>
        ssm
          .modifyDocumentPermission({
            Name: name,
            PermissionType: 'Share',
            AccountIdsToAdd: currentAccountIds,
          })
          .promise(),
      );
      currentAccountIds = paginate(shareAccounts, ++pageNumber, pageSize);
    }
  }

  if (unShareAccounts.length > 0) {
    let pageNumber = 1;
    let currentAccountIds: string[] = paginate(unShareAccounts, pageNumber, pageSize);
    while (currentAccountIds.length > 0) {
      await throttlingBackOff(() =>
        ssm
          .modifyDocumentPermission({
            Name: name,
            PermissionType: 'Share',
            AccountIdsToRemove: currentAccountIds,
          })
          .promise(),
      );
      currentAccountIds = paginate(unShareAccounts, ++pageNumber, pageSize);
    }
  }

  return {
    physicalResourceId: `SSMDocumentShare-${name}`,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`SSM Document Share Delete...`);
  console.log(JSON.stringify(event, null, 2));
  const { accountIds, name } = (event.ResourceProperties as unknown) as HandlerProperties;
  if (event.PhysicalResourceId !== `SSMDocumentShare-${name}`) {
    return {
      physicalResourceId: `SSMDocumentShare-${name}`,
    };
  }
  try {
    let pageNumber = 1;
    let currentAccountIds: string[] = paginate(accountIds, pageNumber, pageSize);
    while (currentAccountIds.length > 0) {
      await throttlingBackOff(() =>
        ssm
          .modifyDocumentPermission({
            Name: name,
            PermissionType: 'Share',
            AccountIdsToRemove: currentAccountIds,
          })
          .promise(),
      );
      currentAccountIds = paginate(accountIds, ++pageNumber, pageSize);
    }
  } catch (error) {
    console.warn(error);
  }
}
