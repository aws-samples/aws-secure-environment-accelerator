import * as c from '@aws-accelerator/common-config';
import * as cdk from '@aws-cdk/core';
import { AccountStacks } from '../../common/account-stacks';
import {
  getStackJsonOutput,
  ResolverRulesOutput,
  ResolversOutput,
  StackOutput,
} from '@aws-accelerator/common-outputs/src/stack-output';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { ResolverEndpoint, ResolverRule } from '@aws-accelerator/cdk-constructs/src/route53';
import { JsonOutputValue } from '../../common/json-output';
import { Account, getAccountId } from '../../utils/accounts';
import * as ram from '@aws-cdk/aws-ram';
import { createName, hashPath } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CreateResolverRule } from '@aws-accelerator/custom-resource-create-resolver-rule';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';

export interface CentralEndpointsStep2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  accounts: Account[];
}

/**
 *  Creates Route53 Resolver endpoints and resolver rules
 *  Inbound, OutBound Endoints
 *  Resolver Rules for on-Premise ips
 *  Resolver Rules for mad
 */
export async function step2(props: CentralEndpointsStep2Props) {
  const { accountStacks, config, outputs, accounts } = props;
  // Create resolvers for all VPC configs
  const vpcConfigs = config.getVpcConfigs();
  const madConfigs = config.getMadConfigs();
  const zonesConfig = config['global-options'].zones;
  const accountRulesCounter: { [accountKey: string]: number } = {};
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const resolversConfig = vpcConfig.resolvers;
    if (!resolversConfig) {
      console.debug(`Skipping resolver creation for VPC "${vpcConfig.name}" in account "${accountKey}"`);
      continue;
    }

    /**
     * Checking if current VPC is under Regional Central VPCs (global-options/zones),
     *  If yes the only we will share Rules from this account to another accounts
     */
    const isRuleShareNeeded = !!zonesConfig.find(
      zc => zc.account === accountKey && zc.region === vpcConfig.region && zc['resolver-vpc'] === vpcConfig.name,
    );
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

    const roleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'CentralEndpointDeployment',
    });
    if (!roleOutput) {
      continue;
    }

    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === resolversConfig.subnet).map(s => s.subnetId);
    if (subnetIds.length === 0) {
      console.error(
        `Cannot find subnet IDs for subnet name = ${resolversConfig.subnet} and VPC = ${vpcConfig.name} in outputs`,
      );
      continue;
    }

    let stackSuffix: string;
    if (
      !!zonesConfig.find(
        zc => zc.account === accountKey && zc['resolver-vpc'] === vpcConfig.name && zc.region === vpcConfig.region,
      )
    ) {
      stackSuffix = `EndpointsRules-${vpcConfig.name}`;
    } else {
      if (accountRulesCounter[`${accountKey}-${vpcConfig.region}`]) {
        accountRulesCounter[`${accountKey}-${vpcConfig.region}`] = ++accountRulesCounter[
          `${accountKey}-${vpcConfig.region}`
        ];
      } else {
        accountRulesCounter[`${accountKey}-${vpcConfig.region}`] = 1;
      }
      // Includes max of 10 VPCs, since we need max 8 resources for one VPC
      stackSuffix = `EndpointsRules-${Math.ceil(accountRulesCounter[`${accountKey}-${vpcConfig.region}`] / 10)}`;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region, stackSuffix);
    if (!accountStack) {
      console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while deploying Resolver Endpoints`);
      continue;
    }

    // Call r53-resolver-endpoint per Account
    const r53ResolverEndpoints = new ResolverEndpoint(
      accountStack,
      `ResolverEndpoints-${accountKey}-${vpcConfig.name}`,
      {
        vpcId: vpcOutput.vpcId,
        name: vpcConfig.name,
        subnetIds,
      },
    );
    const resolverOutput: ResolversOutput = {
      vpcName: vpcConfig.name,
      accountKey,
      region: vpcConfig.region,
    };
    const resolverRulesOutput: ResolverRulesOutput = {};

    if (resolversConfig.inbound) {
      r53ResolverEndpoints.enableInboundEndpoint();
      resolverOutput.inBound = r53ResolverEndpoints.inboundEndpointRef;
    }
    const onPremRules: string[] = [];
    const madRules: string[] = [];
    if (resolversConfig.outbound) {
      r53ResolverEndpoints.enableOutboundEndpoint();
      resolverOutput.outBound = r53ResolverEndpoints.outboundEndpointRef;

      // For each on-premise domain defined in the parameters file, create a Resolver rule which points to the specified IP's
      for (const onPremRuleConfig of vpcConfig['on-premise-rules'] || []) {
        const rule = new CreateResolverRule(accountStack, `${domainToName(onPremRuleConfig.zone)}-${vpcConfig.name}`, {
          domainName: onPremRuleConfig.zone,
          resolverEndpointId: r53ResolverEndpoints.outboundEndpointRef!,
          roleArn: roleOutput.roleArn,
          targetIps: onPremRuleConfig['outbound-ips'],
          vpcId: vpcOutput.vpcId,
          name: createRuleName(`${vpcConfig.name}-onprem-${domainToName(onPremRuleConfig.zone)}`),
        });
        rule.node.addDependency(r53ResolverEndpoints.outboundEndpoint!);
        onPremRules.push(rule.ruleId);
      }
      resolverRulesOutput.onPremRules = onPremRules;

      // Check for MAD configuration whose resolver is current account VPC
      const madConfigsWithVpc = madConfigs.filter(
        mc =>
          mc.mad['central-resolver-rule-account'] === accountKey &&
          mc.mad.region === vpcConfig.region &&
          mc.mad['central-resolver-rule-vpc'] === vpcConfig.name,
      );
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

        const madRule = new CreateResolverRule(accountStack, `${domainToName(mad['dns-domain'])}-${vpcConfig.name}`, {
          domainName: mad['dns-domain'],
          resolverEndpointId: r53ResolverEndpoints.outboundEndpointRef!,
          roleArn: roleOutput.roleArn,
          targetIps: madIPs,
          vpcId: vpcOutput.vpcId,
          name: createRuleName(`${vpcConfig.name}-mad-${domainToName(mad['dns-domain'])}`),
        });
        madRule.node.addDependency(r53ResolverEndpoints.outboundEndpoint!);
        madRules.push(madRule.ruleId);
      }
      resolverRulesOutput.madRules = madRules;
    }
    resolverOutput.rules = resolverRulesOutput;
    new JsonOutputValue(accountStack, `ResolverOutput-${resolverOutput.vpcName}`, {
      type: 'GlobalOptionsOutput',
      value: resolverOutput,
    });

    if (!isRuleShareNeeded) {
      console.info(`VPC "${vpcConfig.name}" is not part of Central VPC under zones configuration`);
      continue;
    }

    const regionVpcs = config
      .getVpcConfigs()
      .filter(
        vc =>
          vc.vpcConfig.region === vpcConfig.region &&
          vc.vpcConfig['use-central-endpoints'] &&
          vc.accountKey !== accountKey,
      );
    if (!regionVpcs || regionVpcs.length === 0) {
      console.info(`No VPCs to be shared with central Account VPC in region "${vpcConfig.region}"`);
      continue;
    }

    const sharedToAccountKeys = regionVpcs.map(rv => rv.accountKey);
    const sharedToAccountIds: string[] = sharedToAccountKeys.map(accId => getAccountId(accounts, accId)!);
    if (sharedToAccountIds.length === 0) {
      console.info(`No Accounts exists for sharing Resolver Rules in region : ${vpcConfig.region}`);
      continue;
    }

    const ruleArns: string[] = [
      ...madRules.map(
        ruleId => `arn:aws:route53resolver:${vpcConfig.region}:${cdk.Aws.ACCOUNT_ID}:resolver-rule/${ruleId}`,
      ),
      ...onPremRules.map(
        ruleId => `arn:aws:route53resolver:${vpcConfig.region}:${cdk.Aws.ACCOUNT_ID}:resolver-rule/${ruleId}`,
      ),
    ];

    // share the route53 resolver rules
    new ram.CfnResourceShare(accountStack, `ResolverRuleShare-${vpcConfig.name}`, {
      name: createName({
        name: `${vpcConfig.name}-ResolverRules`,
      }),
      allowExternalPrincipals: false,
      principals: sharedToAccountIds,
      resourceArns: ruleArns,
    });
  }
}

function domainToName(domain: string): string {
  return domain.replace(/\./gi, '-');
}

export function createRuleName(name: string): string {
  const hash = hashPath([name], 8);
  if (name.length > 44) {
    name = name.substring(0, 44) + hash;
  }
  return createName({
    name,
  });
}
