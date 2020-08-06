import { SNS } from '@aws-pbmm/common-lambda/lib/aws/sns';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';

const MAX_SNS_PUBLISH_CHAR = 255500;
const AVG_CHARS_PER_ACCOUNT = 100;

interface NotifyErrorInput {
  notificationTopicArn: string;
  accounts: Account[];
  acceleratorVersion?: string;
}

const sns = new SNS();

export const handler = async (input: NotifyErrorInput): Promise<string> => {
  console.log(`State Machine Execution Success...`);
  console.log(JSON.stringify(input, null, 2));
  const { accounts, acceleratorVersion } = input;
  const responseAccounts = accounts.map(acc => ({
    key: acc.key,
    id: acc.id,
    ouPath: acc.ouPath,
    name: acc.name,
  }));
  let errorCause = {
    allAccounts: 'Yes',
    acceleratorVersion,
    accounts: responseAccounts,
  };
  let errorCauseStr = JSON.stringify(errorCause);
  while (errorCauseStr.length > MAX_SNS_PUBLISH_CHAR) {
    const avgRemoveAccounts = Math.ceil((errorCauseStr.length - MAX_SNS_PUBLISH_CHAR) / AVG_CHARS_PER_ACCOUNT);
    errorCause = {
      allAccounts: 'No',
      acceleratorVersion,
      accounts: errorCause.accounts.slice(0, errorCause.accounts.length - avgRemoveAccounts),
    };
    errorCauseStr = JSON.stringify(errorCause);
  }
  await sns.publish({
    Message: errorCauseStr,
    TopicArn: input.notificationTopicArn,
    MessageStructure: 'email-json',
    Subject: `Accelerator State Machine Execution Success`,
  });
  return 'SUCCESS';
};
