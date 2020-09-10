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
  const centralPhzConfig = config["global-options"].zones.find(zc => zc.names);
  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (!vpcConfig['use-central-endpoints']) {
      continue;
    }

    if (accountKey === centralPhzConfig?.account && vpcConfig.region === centralPhzConfig.region && vpcConfig.name === centralPhzConfig["resolver-vpc"]) {
      console.log(`Current VPC Config ${accountKey}: ${vpcConfig.region}:${vpcConfig.name} is central VPC for Hosted Zones`);
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

    const localCentralVpcConfig = config.getVpcConfigs().find(vc => vc.accountKey === zoneConfig.account && vc.vpcConfig.name === zoneConfig["resolver-vpc"]);
    if (!localCentralVpcConfig) {
      console.error(`Central VPC Config is not found in Configuration under "global-options/zones": "${zoneConfig.account}: ${zoneConfig["resolver-vpc"]}"`);
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

    const hostedZones: string[] = [];
    // Associate VPC to Private Hosted Zones created using Central VPC of this region and external private hosted zones
    // Retriving Global private Hosted Zones
    hostedZones.push(...centralPhzConfig?.names.private!);

    const centralinterfaceEndpoints = localCentralVpcConfig.vpcConfig["interface-endpoints"];
    if (!centralinterfaceEndpoints) {
      console.debug(`No interface endpoints found in Central VPC of region : ${zoneConfig.region}`);
    }

  }
}
