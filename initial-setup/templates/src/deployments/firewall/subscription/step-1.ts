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
  const firewallConfig = deployments?.firewall;
  if (!firewallConfig) {
    return;
  }

  const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpc.region);
  if (!accountStack) {
    console.warn(`Cannot find account stack ${accountStack}`);
    return;
  }

  const subnetId = vpc.subnets[0].id;
  const firewallImageId = firewallConfig['image-id'];

  const firewallAmiSubOutput: AmiSubscriptionOutput = {
    imageId: firewallImageId,
    status: checkStatus(accountStack, firewallImageId, subnetId, 'FirewallAmiSubCheck'),
  };
  new JsonOutputValue(accountStack, `FirewallSubscriptionsOutput${accountKey}`, {
    type: 'AmiSubscriptionStatus',
    value: firewallAmiSubOutput,
  });

  if (managerConfig) {
    const firewallManagerAmiSubOutput: AmiSubscriptionOutput = {
      imageId: managerConfig['image-id'],
      status: checkStatus(accountStack, managerConfig['image-id'], subnetId, 'ManagerAmiSubCheck'),
    };
    new JsonOutputValue(accountStack, `FirewallManagerSubscriptionsOutput${accountKey}`, {
      type: 'AmiSubscriptionStatus',
      value: firewallManagerAmiSubOutput,
    });
  }
}

const checkStatus = (scope: cdk.Construct, imageId: string, subnetId: string, id: string): string => {
  const subscritionCheckResponse = new Ec2MarketPlaceSubscriptionCheck(scope, id, {
    imageId,
    subnetId,
  });
  return subscritionCheckResponse.status;
};
