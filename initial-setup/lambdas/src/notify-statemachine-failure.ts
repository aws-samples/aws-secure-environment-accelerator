import { SNS } from '@aws-pbmm/common-lambda/lib/aws/sns';

interface NotifyErrorInput {
  error: string;
  cause: string;
  notificationTopicArn: string;
}

const sns = new SNS();

export const handler = async (input: NotifyErrorInput): Promise<string> => {
  console.log(`State Machine Execution Failed...`);
  console.log(JSON.stringify(input, null, 2));
  const errorCause = JSON.parse(input.cause);
  await sns.publish({
    Message: JSON.stringify(errorCause),
    TopicArn: input.notificationTopicArn,
    MessageStructure: 'email-json',
    Subject: `Accelerator State Machine Failure`,
  });
  return 'SUCCESS';
};
