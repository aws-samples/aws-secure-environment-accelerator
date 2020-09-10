import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as ram from '@aws-cdk/aws-ram';
import { getStackJsonOutput, ResolversOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { Account, getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';

export interface CentralEndpointsStep3Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  accounts: Account[];
}

/**
 *  Sharing Central VPC Resolver Rules to remote VPC
 *  base on "use-central-endpoints"
 */
export async function step3(props: CentralEndpointsStep3Props) {
  const { accountStacks, config, outputs, accounts } = props;
  const zonesConfig = config['global-options'].zones;
  for (const zoneConfig of zonesConfig) {
    const centralAccountId = getAccountId(accounts, zoneConfig.account);
    const regionVpcs = config
      .getVpcConfigs()
      .filter(
        vc =>
          vc.vpcConfig.region === zoneConfig.region &&
          vc.vpcConfig['use-central-endpoints'] &&
          vc.accountKey !== zoneConfig.account,
      );
    if (!regionVpcs || regionVpcs.length === 0) {
      console.info(`No VPCs to be shared with central Account VPC "${zoneConfig.account}: ${zoneConfig.region}"`);
      continue;
    }
    const sharedToAccountKeys = regionVpcs.map(rv => rv.accountKey);
    const sharedToAccountIds: string[] = sharedToAccountKeys.map(accId => getAccountId(accounts, accId)!);
    if (sharedToAccountIds.length === 0) {
      console.info(`No Accounts exists for sharing Resolver Rules in region : ${zoneConfig.region}`);
      continue;
    }
    const resolversOutputs: ResolversOutput[] = getStackJsonOutput(outputs, {
      accountKey: zoneConfig.account,
      outputType: 'GlobalOptionsOutput',
    });
    const resolversRegionOutputs = resolversOutputs.find(r => r.region === zoneConfig.region);
    if (!resolversOutputs) {
      console.warn(`No Resolvers rules are deployed in account "${zoneConfig.account}: ${zoneConfig.region}"`);
    }
    const ruleArns: string[] = [
      ...resolversRegionOutputs?.rules?.madRules?.map(
        ruleId => `arn:aws:route53resolver:${zoneConfig.region}:${centralAccountId}:resolver-rule/${ruleId}`,
      )!,
      ...resolversRegionOutputs?.rules?.onPremRules?.map(
        ruleId => `arn:aws:route53resolver:${zoneConfig.region}:${centralAccountId}:resolver-rule/${ruleId}`,
      )!,
    ];

    const accountStack = accountStacks.tryGetOrCreateAccountStack(zoneConfig.account);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${zoneConfig.account}`);
      continue;
    }

    // share the route53 resolver rules
    new ram.CfnResourceShare(accountStack, `ResolverRuleShare-${zoneConfig['resolver-vpc']}`, {
      name: createName({
        name: `${zoneConfig['resolver-vpc']}-ResolverRules`,
      }),
      allowExternalPrincipals: false,
      principals: sharedToAccountIds,
      resourceArns: ruleArns,
    });
  }
}
