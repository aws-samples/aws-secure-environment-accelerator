import * as s3 from '@aws-cdk/aws-s3';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AccountStacks } from '../../../common/account-stacks';
import { CfnMarketPlaceSubscriptionCheck } from '@custom-resources/ec2-marketplace-subscription-validation';
import { JsonOutputValue } from '../../../common/json-output';
import { AmiSubscriptionOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import * as cdk from '@aws-cdk/core';

export interface FirewallStep3Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  vpcs: Vpc[];
}

/**
 * Validates Marketplace image Supscription
 *
 * This step outputs the following:
 *   - MarketPlace image subscription status per account
 */
export async function step3(props: FirewallStep3Props) {
  const { accountStacks, config, vpcs } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const managerConfig = accountConfig.deployments?.['firewall-manager'];
    const firewallConfig = accountConfig.deployments?.firewall;
    if (!firewallConfig) {
      continue;
    }

    const vpc = vpcs.find(v => v.name === firewallConfig.vpc);
    if (!vpc) {
      console.log(`Skipping firewall deployment because of missing VPC "${firewallConfig.vpc}"`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }

    const subnetId = vpc.subnets[0].id;
    const firewallImageId = firewallConfig['image-id'];

    const firewallAmiSubOutput: AmiSubscriptionOutput = {
      imageId: firewallImageId,
      status: checkStatus(accountStack, firewallImageId, subnetId, 'FirewallAmiSubCheck'),
    };
    new JsonOutputValue(accountStack, `FirewallSubscriptionsOutput`, {
      type: 'AmiSubscriptionStatus',
      value: firewallAmiSubOutput,
    });

    if (managerConfig) {
      const firewallManagerAmiSubOutput: AmiSubscriptionOutput = {
        imageId: managerConfig['image-id'],
        status: checkStatus(accountStack, managerConfig['image-id'], subnetId, 'ManagerAmiSubCheck'),
      };
      new JsonOutputValue(accountStack, `FirewallManagerSubscriptionsOutput`, {
        type: 'AmiSubscriptionStatus',
        value: firewallManagerAmiSubOutput,
      });
    }
  }
}

const checkStatus = (scope: cdk.Construct, imageId: string, subnetId: string, id: string): string => {
  const subscritionCheckResponse = new CfnMarketPlaceSubscriptionCheck(scope, id, {
    imageId,
    subnetId,
  });
  return subscritionCheckResponse.getAttString('Status');
};
