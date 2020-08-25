import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as sns from '@aws-cdk/aws-sns';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { CfnSnsTopicOutput } from './outputs';
import { createSnsTopicName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { SNS_NOTIFICATION_TYPES } from '@aws-accelerator/common/src/util/constants';

export interface SnsStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

/**
 *
 *  Create SNS Topics High, Medium, Low, Ignore
 *  in Central-Log-Services Account
 */
export async function step1(props: SnsStep1Props) {
  const { accountStacks, config } = props;
  const globalOptions = config['global-options'];
  const centralLogServices = globalOptions['central-log-services'];
  const supportedRegions = globalOptions['supported-regions'];
  const excludeRegions = centralLogServices['sns-excl-regions'];
  const regions = supportedRegions.filter(r => !excludeRegions?.includes(r));
  if (!regions.includes(centralLogServices.region)) {
    regions.push(centralLogServices.region);
  }
  const subscribeEmails = centralLogServices['subscriber-emails'];
  for (const region of regions) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(centralLogServices.account, region);
    if (!accountStack) {
      console.error(`Cannot find account stack ${centralLogServices.account}: ${region}, while deploying SNS`);
      continue;
    }
    for (const notificationType of SNS_NOTIFICATION_TYPES) {
      const topicName = createSnsTopicName(notificationType);
      const topic = new sns.Topic(accountStack, `SnsNotificationTopic${notificationType}`, {
        displayName: topicName,
        topicName,
      });
      if (region === centralLogServices.region && subscribeEmails && subscribeEmails[notificationType]) {
        subscribeEmails[notificationType].forEach((email, index) => {
          new sns.Subscription(accountStack, `SNSTopicSubscriptionFor${notificationType}-${index + 1}`, {
            topic,
            protocol: sns.SubscriptionProtocol.EMAIL,
            endpoint: email,
          });
        });
      }
      new CfnSnsTopicOutput(accountStack, `SnsNotificationTopic${notificationType}Output`, {
        topicArn: topic.topicArn,
        topicKey: notificationType,
        topicName,
      });
    }
  }
}
