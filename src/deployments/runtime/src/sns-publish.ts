import { SNS } from '@aws-accelerator/common/src/aws/sns';
import { SNSEvent } from 'aws-lambda';

const sns = new SNS();
export const handler = async (input: SNSEvent): Promise<void> => {
  console.log('Verifying Account Creation status ....');
  console.log(JSON.stringify(input, null, 2));
  const snsNotificationConfig = input.Records[0].Sns;
  await sns.publish({
    Message: snsNotificationConfig.Message,
    Subject: snsNotificationConfig.Subject,
    TopicArn: '',
  });
};
