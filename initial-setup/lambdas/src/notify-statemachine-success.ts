import { SNS } from '@aws-pbmm/common-lambda/lib/aws/sns';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';

interface NotifyErrorInput {
  notificationTopicArn: string;
  accounts: Account[];
}

const sns = new SNS();

export const handler = async (input: NotifyErrorInput): Promise<string> => {
  console.log(`State Machine Execution Success...`);
  console.log(JSON.stringify(input, null, 2));
  const errorCause = input.accounts;
  await sns.publish({
    Message: JSON.stringify(errorCause),
    TopicArn: input.notificationTopicArn,
    MessageStructure: 'email-json',
    Subject: `Accelerator State Machine Execution Success`,
  });
  return 'SUCCESS';
};
