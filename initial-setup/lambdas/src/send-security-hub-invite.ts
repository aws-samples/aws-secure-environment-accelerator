import { SecurityHub } from '@aws-pbmm/common-lambda/lib/aws/security-hub';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { sendResponse } from './utils';
import { SUCCESS, FAILED } from 'cfn-response';

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Send Invites to Sub Accounts from Security Hub Master ...`);
  const requestType = event.RequestType;
  const resourceId = 'Send-Security-Hub-Invitation';
  if (requestType === 'Delete') {
    // ToDo
    return await sendResponse(event, context, SUCCESS, {}, resourceId);
  }
  try {
    const executionRoleName = process.env.ACCELERATOR_EXECUTION_ROLE_NAME;

    const accountId = event.ResourceProperties.AccountID;
    const memberAccounts = event.ResourceProperties.MemberAccounts;

    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, executionRoleName!);

    const hub = new SecurityHub(credentials);

    // Sending Invites to subaccounts
    console.log(`Sending invites to Sub accounts ${memberAccounts}`);
    const inviteResponse = await hub.inviteMembers(memberAccounts);
    console.log(inviteResponse);
    await sendResponse(event, context, SUCCESS, {}, resourceId);
  } catch (error) {
    console.error(error);
    await sendResponse(event, context, FAILED, {}, resourceId);
  }
};
