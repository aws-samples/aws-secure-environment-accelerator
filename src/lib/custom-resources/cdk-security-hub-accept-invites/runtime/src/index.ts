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
  const masterAccountId = event.ResourceProperties.masterAccountId;

  // get the master account associated to the account
  const masterAccount = await throttlingBackOff(() => hub.getMasterAccount().promise());
  const securityHubMaster = masterAccount.Master;
  // check if master account is a valid association
  if (securityHubMaster && securityHubMaster.AccountId !== masterAccountId) {
    // If not valid, disassociate the master account invitation
    await throttlingBackOff(() => hub.disassociateFromMasterAccount().promise());
  }

  // Check for pending invitations from Master
  let token: string | undefined;
  let invitations: AWS.SecurityHub.InvitationList = [];
  do {
    const response = await throttlingBackOff(() => hub.listInvitations({ NextToken: token }).promise());
    if (response.Invitations) {
      invitations.push(...response.Invitations);
    }
    token = response.NextToken;
  } while (token);
  if (!invitations) {
    console.log(`No Security Hub invitations found`);
  } else {
    // Accepting Invitation from Master account
    const ownerInvitation = invitations.find(x => x.AccountId === masterAccountId);
    if (ownerInvitation) {
      console.log(`Accepting Security Hub invitation`);
      const invitationId = ownerInvitation?.InvitationId!;
      await throttlingBackOff(() =>
        hub
          .acceptInvitation({
            InvitationId: invitationId,
            MasterId: masterAccountId,
          })
          .promise(),
      );
    }
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
