import { SNS } from '@aws-pbmm/common-lambda/lib/aws/sns';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';

const MAX_SNS_PUBLISH_CHAR = 255500;
const AVG_CHARS_PER_ACCOUNT = 100;

interface NotifySuccessInput {
  notificationTopicArn: string;
  accounts: Account[];
  acceleratorVersion?: string;
}

const sns = new SNS();

export const handler = async (input: NotifySuccessInput): Promise<string> => {
  console.log('State Machine Execution Success...');
  console.log(JSON.stringify(input, null, 2));
  const { accounts, acceleratorVersion } = input;
  const responseAccounts = accounts.map(acc => ({
    key: acc.key,
    id: acc.id,
    ouPath: acc.ouPath,
    name: acc.name,
  }));
  let successReturn = {
    allAccounts: 'Yes',
    acceleratorVersion,
    accounts: responseAccounts,
  };
  let successReturnStr = JSON.stringify(successReturn);
  while (successReturnStr.length > MAX_SNS_PUBLISH_CHAR) {
    const avgRemoveAccounts = Math.ceil((successReturnStr.length - MAX_SNS_PUBLISH_CHAR) / AVG_CHARS_PER_ACCOUNT);
    successReturn = {
      allAccounts: 'No',
      acceleratorVersion,
      accounts: successReturn.accounts.slice(0, successReturn.accounts.length - avgRemoveAccounts),
    };
    successReturnStr = JSON.stringify(successReturn);
  }
  await sns.publish({
    Message: successReturnStr,
    TopicArn: input.notificationTopicArn,
    Subject: 'Accelerator State Machine Execution Success',
  });
  return 'SUCCESS';
};
