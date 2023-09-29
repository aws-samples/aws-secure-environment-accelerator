/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as c from '@aws-accelerator/common-config';
import { AccountStack, AccountStacks } from '../../common/account-stacks';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as kms from 'aws-cdk-lib/aws-kms';
import { createSnsTopicName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { SNS_NOTIFICATION_TYPES } from '@aws-accelerator/common/src/util/constants';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CfnSnsTopicOutput } from './outputs';
import { Account, getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { Organizations } from '@aws-accelerator/custom-resource-organization';
import { LogBucketOutputTypeOutputFinder } from '@aws-accelerator/common-outputs/src/buckets';
import { AccountBucketOutputFinder } from '../defaults';
import { DefaultKmsOutputFinder } from '@aws-accelerator/common-outputs/src/kms';

export interface SnsStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  accounts: Account[];
}

/**
 *
 *  Create SNS Topics High, Medium, Low, Ignore
 *  in Central-Log-Services Account
 */
export async function step1(props: SnsStep1Props) {
  const { accountStacks, config, outputs, accounts } = props;
  const globalOptions = config['global-options'];
  const centralLogServices = globalOptions['central-log-services'];
  const centralSecurityServices = globalOptions['central-security-services'];
  const supportedRegions = globalOptions['supported-regions'];
  const excludeRegions = centralLogServices['sns-excl-regions'];
  const managementAccountConfig = globalOptions['aws-org-management'];
  const regions = supportedRegions.filter(r => !excludeRegions?.includes(r));
  if (!regions.includes(centralLogServices.region)) {
    regions.push(centralLogServices.region);
  }
  const subscribeEmails = centralLogServices['sns-subscription-emails'];
  const snsSubscriberLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: centralLogServices.account,
    roleKey: 'SnsSubscriberLambda',
  });
  if (!snsSubscriberLambdaRoleOutput) {
    console.error(`Role required for SNS Subscription Lambda is not created in ${centralLogServices.account}`);
    return;
  }
  const centralLogServicesAccount = getAccountId(accounts, centralLogServices.account)!;
  for (const region of regions) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(centralLogServices.account, region);
    if (!accountStack) {
      console.error(`Cannot find account stack ${centralLogServices.account}: ${region}, while deploying SNS`);
      continue;
    }
    createSnsTopics({
      accountStack,
      subscriberRoleArn: snsSubscriberLambdaRoleOutput.roleArn,
      region,
      centralServicesRegion: centralLogServices.region,
      subscribeEmails,
      centralAccount: centralLogServicesAccount,
      orgManagementAccount: managementAccountConfig['add-sns-topics']
        ? getAccountId(accounts, managementAccountConfig.account)
        : undefined,
      orgSecurityAccount:
        centralSecurityServices['fw-mgr-alert-level'] !== 'None' || centralSecurityServices['add-sns-topics']
          ? getAccountId(accounts, centralSecurityServices.account)
          : undefined,
      outputs,
      config,
    });
  }

  if (managementAccountConfig['add-sns-topics']) {
    const snsSubscriberLambdaRoleMgmtOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: managementAccountConfig.account,
      roleKey: 'SnsSubscriberLambda',
    });
    if (!snsSubscriberLambdaRoleMgmtOutput) {
      console.error(`Role required for SNS Subscription Lambda is not created in ${centralLogServices.account}`);
      return;
    }
    const accountStack = accountStacks.tryGetOrCreateAccountStack(
      managementAccountConfig.account,
      centralLogServices.region,
    );
    if (!accountStack) {
      console.error(
        `Cannot find account stack ${managementAccountConfig.account}: ${centralLogServices.region}, while deploying SNS`,
      );
      return;
    }
    createSnsTopics({
      accountStack,
      subscriberRoleArn: snsSubscriberLambdaRoleMgmtOutput.roleArn,
      region: centralLogServices.region,
      centralServicesRegion: centralLogServices.region,
      subscribeEmails,
      centralAccount: centralLogServicesAccount,
      orgManagementSns: true,
      outputs,
      config,
    });
  }

  if (centralSecurityServices['add-sns-topics']) {
    const snsSubscriberLambdaRoleMgmtOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: centralSecurityServices.account,
      roleKey: 'SnsSubscriberLambda',
    });
    if (!snsSubscriberLambdaRoleMgmtOutput) {
      console.error(`Role required for SNS Subscription Lambda is not created in ${centralLogServices.account}`);
      return;
    }
    for (const region of regions) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(centralSecurityServices.account, region);
      if (!accountStack) {
        console.error(`Cannot find account stack ${centralLogServices.account}: ${region}, while deploying SNS`);
        continue;
      }
      createSnsTopics({
        accountStack,
        subscriberRoleArn: snsSubscriberLambdaRoleMgmtOutput.roleArn,
        region: centralLogServices.region,
        centralServicesRegion: centralLogServices.region,
        subscribeEmails,
        centralAccount: centralLogServicesAccount,
        orgManagementSns: true,
        outputs,
        config,
      });
    }
  }
}

/**
 * Function to create SNS topics in provided accountStack and subscription lambdas and subscriptions based on region
 * @param props
 */
function createSnsTopics(props: {
  accountStack: AccountStack;
  subscriberRoleArn: string;
  region: string;
  centralServicesRegion: string;
  subscribeEmails: {
    [x: string]: string[];
  };
  centralAccount: string;
  /**
   * Used to create separate SNS topics in org management account default region
   */
  orgManagementSns?: boolean;
  /**
   * Org management account for adding publish permissions
   */
  orgManagementAccount?: string;
  /**
   * Org Security account for adding publish permissions
   */
  orgSecurityAccount?: string;
  outputs: StackOutput[];
  config: c.AcceleratorConfig;
}) {
  const {
    accountStack,
    centralAccount,
    centralServicesRegion,
    region,
    subscribeEmails,
    subscriberRoleArn,
    orgManagementSns,
    orgManagementAccount,
    orgSecurityAccount,
    outputs,
    config,
  } = props;
  const lambdaPath = require.resolve('@aws-accelerator/deployments-runtime');
  const lambdaDir = path.dirname(lambdaPath);
  const lambdaCode = lambda.Code.fromAsset(lambdaDir);
  const role = iam.Role.fromRoleArn(accountStack, `SnsSubscriberLambdaRole`, subscriberRoleArn);
  let snsSubscriberFunc: lambda.Function | undefined;
  if (region !== centralServicesRegion || (region === centralServicesRegion && orgManagementSns)) {
    snsSubscriberFunc = new lambda.Function(accountStack, `SnsSubscriberLambda`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.createSnsPublishToCentralRegion',
      code: lambdaCode,
      role,
      environment: {
        CENTRAL_LOG_SERVICES_REGION: centralServicesRegion,
        CENTRAL_LOG_ACCOUNT: centralAccount,
      },
      timeout: cdk.Duration.minutes(15),
    });

    snsSubscriberFunc.addPermission(`InvokePermission-SnsSubscriberLambda`, {
      action: 'lambda:InvokeFunction',
      principal: new iam.ServicePrincipal('sns.amazonaws.com'),
    });
  }

  const ignoreActionFunc = new lambda.Function(accountStack, `IgnoreActionLambda`, {
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'index.createIgnoreAction',
    code: lambdaCode,
    role,
    timeout: cdk.Duration.minutes(15),
  });

  ignoreActionFunc.addPermission(`InvokePermission-IgnoreActionLambda`, {
    action: 'lambda:InvokeFunction',
    principal: new iam.ServicePrincipal('sns.amazonaws.com'),
  });

  const organizations = new Organizations(accountStack, 'SnsOrganizationsLookup');
  const keyArn = tryFindDefaultKeyArn(
    config,
    centralServicesRegion,
    accountStack,
    centralAccount,
    outputs,
    orgManagementSns,
  );
  let masterKey: kms.IKey;
  if (keyArn !== undefined) {
    masterKey = kms.Key.fromKeyArn(accountStack, `DefaultKey-$${accountStack.accountKey}-${region}`, keyArn);
  }
  for (const notificationType of SNS_NOTIFICATION_TYPES) {
    const topicName = createSnsTopicName(notificationType);
    const topic = masterKey!!
      ? new sns.Topic(accountStack, `SnsNotificationTopic${notificationType}`, {
          displayName: topicName,
          topicName,
          masterKey,
        })
      : new sns.Topic(accountStack, `SnsNotificationTopic${notificationType}`, {
          displayName: topicName,
          topicName,
        });

    // Allowing Publish from CloudWatch Service from any account
    topic.grantPublish({
      grantPrincipal: new iam.ServicePrincipal('cloudwatch.amazonaws.com'),
    });

    // Allowing Publish from Lambda Service from any account
    topic.grantPublish({
      grantPrincipal: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Allowing Publish from Events Service from any account
    topic.grantPublish({
      grantPrincipal: new iam.ServicePrincipal('events.amazonaws.com'),
    });

    topic.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.AnyPrincipal()],
        effect: iam.Effect.ALLOW,
        actions: ['sns:ListSubscriptionsByTopic'],
        resources: [topic.topicArn],
        conditions: {
          ['StringEquals']: {
            'aws:PrincipalOrgID': organizations.organizationId,
          },
          ['StringLike']: {
            'aws:PrincipalArn':
              'arn:aws:iam::*:role/aws-service-role/securityhub.amazonaws.com/AWSServiceRoleForSecurityHub',
          },
        },
      }),
    );

    if (orgManagementAccount) {
      topic.grantPublish({
        grantPrincipal: new iam.AccountPrincipal(orgManagementAccount),
      });
    }

    if (orgSecurityAccount) {
      topic.grantPublish({
        grantPrincipal: new iam.AccountPrincipal(orgSecurityAccount),
      });
    }

    if (region === centralServicesRegion && subscribeEmails && subscribeEmails[notificationType] && !orgManagementSns) {
      subscribeEmails[notificationType].forEach((email, index) => {
        new sns.CfnSubscription(accountStack, `SNSTopicSubscriptionFor${notificationType}-${index + 1}`, {
          topicArn: topic.topicArn,
          protocol: sns.SubscriptionProtocol.EMAIL,
          endpoint: email,
        });
      });
    } else if (region === centralServicesRegion && notificationType.toLowerCase() === 'ignore') {
      new sns.CfnSubscription(accountStack, `SNSTopicSubscriptionFor${notificationType}`, {
        topicArn: topic.topicArn,
        protocol: sns.SubscriptionProtocol.LAMBDA,
        endpoint: ignoreActionFunc.functionArn,
      });
    } else if (
      (region !== centralServicesRegion || (region === centralServicesRegion && orgManagementSns)) &&
      snsSubscriberFunc
    ) {
      new sns.CfnSubscription(accountStack, `SNSTopicSubscriptionFor${notificationType}`, {
        topicArn: topic.topicArn,
        protocol: sns.SubscriptionProtocol.LAMBDA,
        endpoint: snsSubscriberFunc.functionArn,
      });
    }

    new CfnSnsTopicOutput(accountStack, `SnsNotificationTopic${notificationType}-Otuput`, {
      topicArn: topic.topicArn,
      topicKey: notificationType,
      topicName: topic.topicName,
    });
  }
}

function tryFindDefaultKeyArn(
  config: c.AcceleratorConfig,
  centralServicesRegion: string,
  accountStack: AccountStack,
  centralAccount: string,
  outputs: StackOutput[],
  orgManagementSns?: boolean,
) {
  const managementAccountKey = config['global-options']['aws-org-management'].account;
  const securityAccountKey = config['global-options']['central-security-services'].account;

  if (accountStack.region === centralServicesRegion && accountStack.account === centralAccount) {
    // Retrieve Encryption keys from LogBucketOutPut for central log region
    const logBucket = LogBucketOutputTypeOutputFinder.findOneByName({
      outputs,
      accountKey: accountStack.accountKey,
      region: accountStack.region,
    });
    return logBucket?.encryptionKeyArn!;
  } else if (
    (accountStack.account === centralAccount || accountStack.accountKey === securityAccountKey) &&
    accountStack.region !== centralServicesRegion
  ) {
    const defaultEncryptionKey = DefaultKmsOutputFinder.tryFindOne({
      outputs,
      accountKey: accountStack.accountKey,
      region: accountStack.region,
    });
    return defaultEncryptionKey?.encryptionKeyArn!;
  } else if (
    (accountStack.accountKey === managementAccountKey || accountStack.accountKey === securityAccountKey) &&
    orgManagementSns &&
    accountStack.region === centralServicesRegion
  ) {
    // AccountBucketOutPut for management account
    const accountBucket = AccountBucketOutputFinder.tryFindOneByName({
      outputs,
      accountKey: accountStack.accountKey,
      region: accountStack.region,
    });
    return accountBucket?.encryptionKeyArn!;
  } else {
    // Any other case, return undefined
    return undefined;
  }
}
