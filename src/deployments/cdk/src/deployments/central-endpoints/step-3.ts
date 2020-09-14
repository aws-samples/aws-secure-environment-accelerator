import { AccountStacks } from '../../common/account-stacks';
import { getStackJsonOutput, ResolversOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import * as c from '@aws-accelerator/common-config';
import * as route53resolver from '@aws-cdk/aws-route53resolver';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';

export interface CentralEndpointsStep3Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 *  Associate VPC to Hosted Zones and Resoler Rules in central vpc account
 */
export async function step3(props: CentralEndpointsStep3Props) {
  const { accountStacks, config, outputs } = props;
  const allVpcConfigs = config.getVpcConfigs();
  const accountRulesCounter: { [accountKey: string]: number } = {};
  for (const { accountKey, vpcConfig } of allVpcConfigs) {
    const centralPhzConfig = config['global-options'].zones.find(zc => zc.region === vpcConfig.region);
    if (!vpcConfig['use-central-endpoints']) {
      continue;
    }

    // If Current VPC exists in global-options/zones then no need to share it with any Rules
    if (
      accountKey === centralPhzConfig?.account &&
      vpcConfig.region === centralPhzConfig.region &&
      vpcConfig.name === centralPhzConfig['resolver-vpc']
    ) {
      console.log(
        `Current VPC Config ${accountKey}: ${vpcConfig.region}:${vpcConfig.name} is central VPC for Hosted Zones`,
      );
      continue;
    }

    // Retrieving current VPCId
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

    const zoneConfig = config['global-options'].zones.find(z => z.region === vpcConfig.region);
    if (!zoneConfig) {
      console.error(`No Central VPC is defined in Region :: ${vpcConfig.region}`);
      continue;
    }

    const localCentralVpcConfig = config
      .getVpcConfigs()
      .find(vc => vc.accountKey === zoneConfig.account && vc.vpcConfig.name === zoneConfig['resolver-vpc']);
    if (!localCentralVpcConfig) {
      console.error(
        `Central VPC Config is not found in Configuration under "global-options/zones": "${zoneConfig.account}: ${zoneConfig['resolver-vpc']}"`,
      );
      continue;
    }

    const resolversOutputs: ResolversOutput[] = getStackJsonOutput(outputs, {
      accountKey: zoneConfig.account,
      outputType: 'GlobalOptionsOutput',
    });
    const resolverRegionoutputs = resolversOutputs.find(
      resOut => resOut.region === vpcConfig.region && resOut.vpcName === centralPhzConfig?.['resolver-vpc'],
    );
    if (!resolverRegionoutputs) {
      console.error(`Resolver rules are not Deployed in Central VPC Region ${zoneConfig.account}::${vpcConfig.region}`);
      continue;
    }

    if (accountRulesCounter[`${accountKey}-${vpcConfig.region}`]) {
      accountRulesCounter[`${accountKey}-${vpcConfig.region}`] = ++accountRulesCounter[
        `${accountKey}-${vpcConfig.region}`
      ];
    } else {
      accountRulesCounter[`${accountKey}-${vpcConfig.region}`] = 1;
    }

    const stackSuffix = `RulesAssc-${Math.ceil(accountRulesCounter[`${accountKey}-${vpcConfig.region}`] / 50)}`;

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region, stackSuffix);
    if (!accountStack) {
      console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while Associating Resolver Rules`);
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
