import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as cdk from '@aws-cdk/core';
import * as sns from '@aws-cdk/aws-sns';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { CfnSnsTopicOutput } from './outputs';
import { createSnsTopicName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';

export interface SnsStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 *
 *  Create SNS Topics High, Medium, Low, Ignore
 *  in Central-Log-Services Account
 */
export async function step1(props: SnsStep1Props) {
  const { accountStacks, config, outputs } = props;
  const globalOptions = config['global-options'];
  const centralLogServices = globalOptions['central-log-services'];
  const supportedRegions = globalOptions['supported-regions'];
  const excludeRegions = centralLogServices['sns-excl-regions'];
  const regions = supportedRegions.filter(r => excludeRegions && !excludeRegions.includes(r));
  if (!regions.includes(centralLogServices.region)) {
    regions.push(centralLogServices.region);
  }

  for (const region of regions) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(centralLogServices.account, region);
    if (!accountStack) {
      console.error(`Cannot find account stack ${centralLogServices.account}: ${region}, while deploying SNS`);
      continue;
    }
    const notificationTypes = ['High', 'Medium', 'Low', 'Ignore'];
    for (const notificationType of notificationTypes) {
      const topicName = createSnsTopicName(notificationType);
      const topic = new sns.Topic(accountStack, `SnsNotificationTopic${notificationType}`, {
        displayName: topicName,
        topicName,
      });
      new CfnSnsTopicOutput(accountStack, `SnsNotificationTopic${notificationType}Output`, {
        topicArn: topic.topicArn,
        topicKey: notificationType,
        topicName,
      });
    }
  }
}
