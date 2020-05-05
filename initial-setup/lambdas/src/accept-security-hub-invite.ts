import { SecurityHub } from '@aws-pbmm/common-lambda/lib/aws/security-hub';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { sendResponse } from './utils';
import { SUCCESS, FAILED } from 'cfn-response';
import { delay } from '@aws-pbmm/common-lambda/lib/util/delay';


export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Enable Secutiry Hub Standards ...`);
  const requestType = event.RequestType;
  const resourceId = 'Accept-Security-Hub-Invitation';
  if ( requestType === 'Delete') {
    // ToDo
    return await sendResponse(event, context, SUCCESS, {}, resourceId)
  }
  try{
    const executionRoleName = process.env.ACCELERATOR_EXECUTION_ROLE_NAME;

    const accountId = event.ResourceProperties.AccountID;
    const ownerAccountId = event.ResourceProperties.OwnerAccountID;

    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, executionRoleName!);

    const hub = new SecurityHub(credentials);
    console.log(`Enabling Security Hub in ${accountId}`);
    const standardsResponse = await hub.describeStandards();
    

    // Check for pending invitaions from Master
    const invitations = await hub.listInvitations();
    if (!invitations.Invitations) {
      console.log(`No invitations found in ${accountId}`);
    } else {
      console.log(invitations);
      const ownerInvitation = invitations.Invitations.find(x => x.AccountId === ownerAccountId);
    //   const invitationId = ownerInvitation?.InvitationId!;
    //   const acceptResponse = await hub.acceptInvitation(invitationId, ownerAccountId);
    //   console.log(acceptResponse);
    }
    await sendResponse(event, context, SUCCESS, {}, resourceId);
  } catch (error) {
    console.error(error);
    await sendResponse(event, context, FAILED, {}, resourceId);
  }
};