import { SNS } from '@aws-accelerator/common/src/aws/sns';
import { SNSEvent, Context } from 'aws-lambda';

const logCentralRegion = process.env.CENTRAL_LOG_SERVICES_REGION!;
const logCentralAccount = process.env.CENTRAL_LOG_ACCOUNT!;
const sns = new SNS(undefined, logCentralRegion);

export const handler = async (input: SNSEvent, context: Context): Promise<void> => {
  console.log('Verifying Account Creation status ....');
  console.log(JSON.stringify(input, null, 2));
  const snsNotificationConfig = input.Records[0].Sns;
  const topicArn = snsNotificationConfig.TopicArn;
  const topicName = topicArn.split(':').pop();
  await sns.publish({
    Message: snsNotificationConfig.Message,
    Subject: snsNotificationConfig.Subject,
    TopicArn: `arn:aws:sns:${logCentralRegion}:${logCentralAccount}:${topicName}`,
  });
};
