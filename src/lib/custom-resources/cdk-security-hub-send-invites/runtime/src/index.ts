import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

const hub = new AWS.SecurityHub();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Sending Security Hub Invites to Sub Accounts...`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
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

  const memberParams = {
    AccountDetails: memberAccounts,
  };
  // Creating Members
  console.log(`Creating Members for "${memberParams}"`);
  const accountIds: string[] = [];
  await hub.createMembers(memberParams).promise();
  for (const account of memberAccounts) {
    accountIds.push(account.AccountId);
  }

  const params = {
    AccountIds: accountIds,
  };
  console.log(`Inviting Members for "${accountIds}"`);
  const inviteResponse = await hub.inviteMembers(params).promise();
  console.log(`Invite Sub Accounts Response "${inviteResponse}"`);
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
