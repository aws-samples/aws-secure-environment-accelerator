import { SNS } from '@aws-accelerator/common/src/aws/sns';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { loadAccounts } from './utils/load-accounts';

const MAX_SNS_PUBLISH_CHAR = 255500;
const AVG_CHARS_PER_ACCOUNT = 100;

interface NotifySuccessInput {
  notificationTopicArn: string;
  parametersTableName: string;
  acceleratorVersion?: string;
}

const sns = new SNS();
const dynamodb = new DynamoDB();

export const handler = async (input: NotifySuccessInput): Promise<string> => {
  console.log('State Machine Execution Success...');
  console.log(JSON.stringify(input, null, 2));
  const { acceleratorVersion, parametersTableName } = input;
  const accounts = (await loadAccounts(parametersTableName, dynamodb)).filter(acc => acc.inScope);
  const responseAccounts = accounts.map(acc => ({
    key: acc.key,
    id: acc.id,
    ouPath: acc.ouPath,
    name: acc.name,
  }));
  const defaultReturnArguments = {
    acceleratorVersion,
    Status: 'SUCCESS',
  };
  let successReturn = {
    // Adding defaultArguments in return with appropriate order
    ...defaultReturnArguments,
    allAccounts: 'Yes',
    accounts: responseAccounts,
  };
  let successReturnStr = JSON.stringify(successReturn);
  while (successReturnStr.length > MAX_SNS_PUBLISH_CHAR) {
    const avgRemoveAccounts = Math.ceil((successReturnStr.length - MAX_SNS_PUBLISH_CHAR) / AVG_CHARS_PER_ACCOUNT);
    successReturn = {
      // Adding defaultArguments in return with appropriate order
      ...defaultReturnArguments,
      allAccounts: 'No',
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
