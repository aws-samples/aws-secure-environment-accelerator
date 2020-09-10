import { AccountStacks } from '../../common/account-stacks';
import { getStackJsonOutput, ResolversOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import * as c from '@aws-accelerator/common-config';
import * as route53resolver from '@aws-cdk/aws-route53resolver';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';

export interface CentralEndpointsStep4Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 *  Associate VPC to Hosted Zones and Resoler Rules in central vpc account
 */
export async function step4(props: CentralEndpointsStep4Props) {
  const { accountStacks, config, outputs } = props;
  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (!vpcConfig['use-central-endpoints']) {
      continue;
    }

    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      region: vpcConfig.region,
      vpcName: vpcConfig.name,
    });
    if (!vpcOutput) {
      console.error(`Cannot find resolved VPC with name "${vpcConfig.name}"`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while Associating Resolver Rules`);
      continue;
    }

    const zoneConfig = config['global-options'].zones.find(z => z.region === vpcConfig.region);
    if (!zoneConfig) {
      console.error(`No Central VPC is defined in Region :: ${vpcConfig.region}`);
      continue;
    }
    const resolversOutputs: ResolversOutput[] = getStackJsonOutput(outputs, {
      accountKey: zoneConfig.account,
      outputType: 'GlobalOptionsOutput',
    });
    const resolverRegionoutputs = resolversOutputs.find(resOut => resOut.region === vpcConfig.region);
    if (!resolverRegionoutputs) {
      console.error(`Resolver rules are not Deployed in Central VPC Region ${zoneConfig.account}::${vpcConfig.region}`);
      continue;
    }
    const ruleIds = [...resolverRegionoutputs.rules?.madRules!, ...resolverRegionoutputs.rules?.onPremRules!];
    for (const ruleId of ruleIds) {
      new route53resolver.CfnResolverRuleAssociation(accountStack, `Rule-Association-${ruleId}-${vpcConfig.name}`, {
        resolverRuleId: ruleId,
        vpcId: vpcOutput.vpcId,
      });
    }
  }
}
