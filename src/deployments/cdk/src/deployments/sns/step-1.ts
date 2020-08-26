import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as sns from '@aws-cdk/aws-sns';
import { CfnSnsTopicOutput } from './outputs';
import { createSnsTopicName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { SNS_NOTIFICATION_TYPES } from '@aws-accelerator/common/src/util/constants';
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cdk from '@aws-cdk/core';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import * as iam from '@aws-cdk/aws-iam';

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
    const snsSubscriberLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: centralLogServices.account,
      roleKey: 'SnsSubscriberLambda',
    });
    if (!snsSubscriberLambdaRoleOutput) {
      continue;
    }
    const lambdaPath = require.resolve('@aws-accelerator/deployments-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const lambdaCode = lambda.Code.fromAsset(lambdaDir);
    const role = iam.Role.fromRoleArn(accountStack, `SnsSubscriberLambdaRole`, snsSubscriberLambdaRoleOutput.roleArn);
    let snsSubscriberFunc: lambda.Function | undefined;
    if (region !== centralLogServices.region) {
      snsSubscriberFunc = new lambda.Function(accountStack, `SnsSubscriberLambda`, {
        runtime: lambda.Runtime.NODEJS_12_X,
        handler: 'index.createSnsPublishToCentralRegion',
        code: lambdaCode,
        role,
        environment: {
          CENTRAL_LOG_SERVICES_REGION: centralLogServices.region,
        },
        timeout: cdk.Duration.minutes(15),
      });
    }

    const ignoreActionFunc = new lambda.Function(accountStack, `IgnoreActionLambda`, {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.createIgnoreAction',
      code: lambdaCode,
      role,
      timeout: cdk.Duration.minutes(15),
    });

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
      } else if (region === centralLogServices.region && notificationType.toLowerCase() === 'ignore') {
        new sns.Subscription(accountStack, `SNSTopicSubscriptionFor${notificationType}`, {
          topic,
          protocol: sns.SubscriptionProtocol.LAMBDA,
          endpoint: ignoreActionFunc.functionArn,
        });
      } else if (region !== centralLogServices.region && snsSubscriberFunc) {
        new sns.Subscription(accountStack, `SNSTopicSubscriptionFor${notificationType}`, {
          topic,
          protocol: sns.SubscriptionProtocol.LAMBDA,
          endpoint: snsSubscriberFunc.functionArn,
        });
      }

      // Outputs are not needed for now
      // new CfnSnsTopicOutput(accountStack, `SnsNotificationTopic${notificationType}Output`, {
      //   topicArn: topic.topicArn,
      //   topicKey: notificationType,
      //   topicName,
      // });
    }
  }
}
