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
  const masterAccountId = event.ResourceProperties.masterAccountId;

  // get the master account associated to the account
  const masterAccount = await hub.getMasterAccount().promise();
  const securityHubMaster = masterAccount.Master;
  // check if master account is a valid association
  if (securityHubMaster && securityHubMaster.AccountId !== masterAccountId) {
    // If not valid, disassociate the master account invitation
    await hub.disassociateFromMasterAccount().promise();
  }

  // Check for pending invitations from Master
  const invitations = await hub.listInvitations().promise();
  if (!invitations.Invitations) {
    console.log(`No Security Hub invitations found`);
  } else {
    // Accepting Invitation from Master account
    const ownerInvitation = invitations.Invitations.find(x => x.AccountId === masterAccountId);
    if (ownerInvitation) {
      const invitationId = ownerInvitation?.InvitationId!;
      await hub
        .acceptInvitation({
          InvitationId: invitationId,
          MasterId: masterAccountId,
        })
        .promise();
    }
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
