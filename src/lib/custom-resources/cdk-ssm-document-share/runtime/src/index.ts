import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  name: string;
  accountIds: string[];
}

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
  await throttlingBackOff(() =>
    ssm
      .modifyDocumentPermission({
        Name: name,
        PermissionType: 'Share',
        AccountIdsToAdd: accountIds,
      })
      .promise(),
  );
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
    await throttlingBackOff(() =>
      ssm
        .modifyDocumentPermission({
          Name: name,
          PermissionType: 'Share',
          AccountIdsToAdd: shareAccounts,
        })
        .promise(),
    );
  }

  if (unShareAccounts.length > 0) {
    await throttlingBackOff(() =>
      ssm
        .modifyDocumentPermission({
          Name: name,
          PermissionType: 'Share',
          AccountIdsToRemove: unShareAccounts,
        })
        .promise(),
    );
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
    await throttlingBackOff(() =>
      ssm
        .modifyDocumentPermission({
          Name: name,
          PermissionType: 'Share',
          AccountIdsToRemove: accountIds,
        })
        .promise(),
    );
  } catch (error) {
    console.warn(error);
  }
}
