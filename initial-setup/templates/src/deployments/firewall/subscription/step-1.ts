import * as c from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AccountStacks } from '../../../common/account-stacks';
import { Ec2MarketPlaceSubscriptionCheck } from '@custom-resources/ec2-marketplace-subscription-validation';
import { JsonOutputValue } from '../../../common/json-output';
import { AmiSubscriptionOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import * as cdk from '@aws-cdk/core';

export interface FirewallSubscriptionStep1Props {
  accountKey: string;
  deployments: c.DeploymentConfig;
  vpc: Vpc;
  accountStacks: AccountStacks;
}

/**
 * Validates Marketplace image subscription
 *
 * This step outputs the following:
 *   - Marketplace image subscription status per account
 */
export async function step1(props: FirewallSubscriptionStep1Props) {
  const { accountKey, deployments, vpc, accountStacks } = props;

  const managerConfig = deployments?.['firewall-manager'];
  const firewallConfigs = deployments?.firewalls;
  if (!firewallConfigs || firewallConfigs.length === 0) {
    return;
  }

  for (const [index, firewallConfig] of Object.entries(firewallConfigs)) {
    if (!vpc) {
      console.log(
        `Skipping firewall marketplace image subscription check because of missing VPC "${firewallConfig.vpc}"`,
      );
      continue;
    }

    const subnetId = vpc.subnets[0].id;
    const firewallImageId = firewallConfig['image-id'];

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, firewallConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }

    const firewallAmiSubOutput: AmiSubscriptionOutput = {
      imageId: firewallImageId,
      status: checkStatus(accountStack, firewallImageId, subnetId, `FirewallAmiSubCheck${index}`),
    };
    new JsonOutputValue(accountStack, `FirewallSubscriptionsOutput${accountKey}${index}`, {
      type: 'AmiSubscriptionStatus',
      value: firewallAmiSubOutput,
    });

    if (managerConfig) {
      const firewallManagerAmiSubOutput: AmiSubscriptionOutput = {
        imageId: managerConfig['image-id'],
        status: checkStatus(accountStack, managerConfig['image-id'], subnetId, `ManagerAmiSubCheck${index}`),
      };
      new JsonOutputValue(accountStack, `FirewallManagerSubscriptionsOutput${accountKey}${index}`, {
        type: 'AmiSubscriptionStatus',
        value: firewallManagerAmiSubOutput,
      });
    }
  }
}

const checkStatus = (scope: cdk.Construct, imageId: string, subnetId: string, id: string): string => {
  const subscriptionCheckResponse = new Ec2MarketPlaceSubscriptionCheck(scope, id, {
    imageId,
    subnetId,
  });
  return subscriptionCheckResponse.status;
};
