import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';

const hub = new AWS.SecurityHub();

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
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
};

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const masterAccountId = event.ResourceProperties.masterAccountId;

  // Check for pending invitaions from Master
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
