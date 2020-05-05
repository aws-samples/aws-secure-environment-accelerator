import { SecurityHub } from '@aws-pbmm/common-lambda/lib/aws/security-hub';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { sendResponse } from './utils';
import { SUCCESS, FAILED } from 'cfn-response';

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Accept Invite from Master Security Hub Account ...`);
  const requestType = event.RequestType;
  const resourceId = 'Accept-Security-Hub-Invitation';
  if (requestType === 'Delete') {
    // ToDo
    return await sendResponse(event, context, SUCCESS, {}, resourceId);
  }
  try {
    const executionRoleName = process.env.ACCELERATOR_EXECUTION_ROLE_NAME;

    const accountId = event.ResourceProperties.AccountID;
    const masterAccountId = event.ResourceProperties.MasterAccountID;

    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, executionRoleName!);

    const hub = new SecurityHub(credentials);

    // Check for pending invitaions from Master
    const invitations = await hub.listInvitations();
    if (!invitations.Invitations) {
      console.log(`No invitations found in ${accountId}`);
    } else {
      console.log(invitations);
      const ownerInvitation = invitations.Invitations.find(x => x.AccountId === masterAccountId);
      if (ownerInvitation) {
        const invitationId = ownerInvitation?.InvitationId!;
        await hub.acceptInvitation(invitationId, masterAccountId);
      }
    }
    await sendResponse(event, context, SUCCESS, {}, resourceId);
  } catch (error) {
    console.error(error);
    await sendResponse(event, context, FAILED, {}, resourceId);
  }
};
