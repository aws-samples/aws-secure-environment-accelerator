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
