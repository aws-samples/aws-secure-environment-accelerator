import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import { getStackJsonOutput, ResolverRulesOutput, ResolversOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { ResolverEndpoint } from '@aws-accelerator/cdk-constructs/src/route53';
import { ResolverRule } from '@aws-accelerator/cdk-constructs/src/route53';
import { JsonOutputValue } from '../../common/json-output';

export interface CentralEndpointsStep2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 *  Creates Route53 Resolver endpoints and resolver rules
 *  Inbound, OutBound Endoints
 *  Resolver Rules for on-Premise ips
 *  Resolver Rules for mad
 */
export async function step2(props: CentralEndpointsStep2Props) {
  const { accountStacks, config, outputs } = props;
  // Create resolvers for all VPC configs
  const vpcConfigs = config.getVpcConfigs();
  const madConfigs = config.getMadConfigs();
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const resolversConfig = vpcConfig.resolvers;
    if (!resolversConfig) {
      console.debug(`Skipping resolver creation for VPC "${vpcConfig.name}" in account "${accountKey}"`);
      continue;
    }
    const vpcSubnet = vpcConfig.subnets?.find(s => s.name === resolversConfig.subnet);
    if (!vpcSubnet) {
      console.error(
        `Subnet provided in resolvers doesn't exist in Subnet = ${resolversConfig.subnet} and VPC = ${vpcConfig.name}`,
      );
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

    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === resolversConfig.subnet).map(s => s.subnetId);
    if (subnetIds.length === 0) {
      console.error(`Cannot find subnet IDs for subnet name = ${resolversConfig.subnet} and VPC = ${vpcConfig.name} in outputs`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while deploying Resolver Endpoints`);
      continue;
    }

    // Call r53-resolver-endpoint per Account
    const r53ResolverEndpoints = new ResolverEndpoint(accountStack, `ResolverEndpoints-${accountKey}-${vpcConfig.name}`, {
      vpcId: vpcOutput.vpcId,
      name: vpcConfig.name,
      subnetIds,
    });
    const resolverOutput: ResolversOutput = {
      vpcName: vpcConfig.name,
      accountKey: accountKey,
      region: vpcConfig.region,
    };
    const resolverRulesOutput: ResolverRulesOutput = {};

    if (resolversConfig.inbound) {
      r53ResolverEndpoints.enableInboundEndpoint();
      resolverOutput.inBound = r53ResolverEndpoints.inboundEndpointRef;
    }

    if (resolversConfig.outbound) {
      r53ResolverEndpoints.enableOutboundEndpoint();
      resolverOutput.outBound = r53ResolverEndpoints.outboundEndpointRef;
      const onPremRules: string[] = [];
      // For each on-premise domain defined in the parameters file, create a Resolver rule which points to the specified IP's
      for (const onPremRuleConfig of vpcConfig['on-premise-rules'] || []) {
        const rule = new ResolverRule(accountStack, `${domainToName(onPremRuleConfig.zone)}-${vpcConfig.name}-on-prem-phz-rule`, {
          domain: onPremRuleConfig.zone,
          endpoint: r53ResolverEndpoints.outboundEndpointRef,
          ipAddresses: onPremRuleConfig['outbound-ips'],
          ruleType: 'FORWARD',
          name: `${domainToName(onPremRuleConfig.zone)}-${vpcConfig.name}-phz-rule`,
          vpcId: vpcOutput.vpcId,
        });
        rule.node.addDependency(r53ResolverEndpoints);
        onPremRules.push(rule.ruleId);
      }
      resolverRulesOutput.onPremRules = onPremRules;

      // Check for MAD configuration whose resolver is current account VPC
      const madRules: string[] = [];
      const madConfigsWithVpc = madConfigs.filter(mc => mc.mad["central-resolver-rule-account"] === accountKey && mc.mad.region === vpcConfig.region && mc.mad["central-resolver-rule-vpc"] === vpcConfig.name);
      for (const { accountKey: madAccountKey, mad } of madConfigsWithVpc) {
        let madIPs: string[];
        const madOutput = getStackJsonOutput(outputs, {
          accountKey: madAccountKey,
          outputType: 'MadOutput',
        });
        if (madOutput.length === 0) {
          console.warn(`MAD is not deployed yet in account ${accountKey}`);
          continue;
        }
        madIPs = madOutput[0].dnsIps.split(',');
        const madRule = new ResolverRule(accountStack, `${domainToName(mad['dns-domain'])}-${vpcConfig.name}-phz-rule`, {
          domain: mad['dns-domain'],
          endpoint: r53ResolverEndpoints.outboundEndpointRef,
          ipAddresses: madIPs,
          ruleType: 'FORWARD',
          name: `${domainToName(mad['dns-domain'])}-${vpcConfig.name}-mad-phz-rule`,
          vpcId: vpcOutput.vpcId,
        });
        madRules.push(madRule.ruleId);
      }
      resolverRulesOutput.madRules = madRules;
    }
    resolverOutput.rules = resolverRulesOutput;
    new JsonOutputValue(accountStack!, `ResolverOutput-${resolverOutput.vpcName}`, {
      type: 'GlobalOptionsOutput',
      value: resolverOutput,
    });
  }
}

function domainToName(domain: string): string {
  return domain.replace(/\./gi, '-');
}
