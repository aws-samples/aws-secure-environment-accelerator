import { SecurityHub } from '@aws-pbmm/common-lambda/lib/aws/security-hub';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { sendResponse } from './utils';
import { SUCCESS, FAILED } from 'cfn-response';

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Send Invites to Sub Accounts from Security Hub Master ...`);
  console.log(event);
  const requestType = event.RequestType;
  const resourceId = 'Send-Security-Hub-Invitation';
  if (requestType === 'Delete') {
    // ToDo
    await sendResponse(event, context, SUCCESS, {}, resourceId);
    return;
  }
  try {
    const executionRoleName = process.env.ACCELERATOR_EXECUTION_ROLE_NAME;

    const accountId = event.ResourceProperties.AccountID;
    const memberAccounts = event.ResourceProperties.MemberAccounts;

    for (const account of memberAccounts) {
      console.log(account);
    }
    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, executionRoleName!);

    const hub = new SecurityHub(credentials);

    const params = {
      AccountDetails: memberAccounts,
    };
    // Creating Members
    console.log(`Creating Members for "${params}"`);
    const accountIds: string[] = [];
    await hub.createMembers(params);
    for (const account of memberAccounts) {
      accountIds.push(account.AccountId);
    }
    console.log(`Inviting Members for "${accountIds}"`);
    const inviteResponse = await hub.inviteMembers(accountIds);
    console.log(`Invite Sub Accounts Response "${inviteResponse}"`);
    await sendResponse(event, context, SUCCESS, {}, resourceId);
  } catch (error) {
    console.error(error);
    await sendResponse(event, context, FAILED, {}, resourceId);
  }
};
