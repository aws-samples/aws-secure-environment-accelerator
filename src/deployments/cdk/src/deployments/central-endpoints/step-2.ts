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
import * as cdk from '@aws-cdk/core';
import { AccountStacks } from '../../common/account-stacks';
import {
  getStackJsonOutput,
  ResolverRulesOutput,
  ResolversOutput,
  StackOutput,
} from '@aws-accelerator/common-outputs/src/stack-output';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { ResolverEndpoint } from '@aws-accelerator/cdk-constructs/src/route53';
import { JsonOutputValue } from '../../common/json-output';
import { Account, getAccountId } from '../../utils/accounts';
import * as ram from '@aws-cdk/aws-ram';
import { createName, hashPath } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CreateResolverRule, TargetIp } from '@aws-accelerator/custom-resource-create-resolver-rule';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import {
  StaticResourcesOutput,
  StaticResourcesOutputFinder,
} from '@aws-accelerator/common-outputs/src/static-resource';
import { CfnStaticResourcesOutput } from './outputs';

// Changing these values will lead to redeploying all Phase-3 Endpoint stacks
const MAX_RESOURCES_IN_STACK = 10;
const RESOURCE_TYPE = 'ResolverEndpointAndRule';
const CENTRAL_VPC_RESOURCE_TYPE = 'CentralVpcResolverEndpointAndRule';
const STACK_COMMON_SUFFIX = 'ResolverEndpoints';
const STACK_CENTRAL_VPC_COMMON_SUFFIX = 'CentralVpcResolverEndpoints';

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

  const allStaticResources: StaticResourcesOutput[] = StaticResourcesOutputFinder.findAll({
    outputs,
  }).filter(sr => sr.resourceType === RESOURCE_TYPE);

  const centralVpcStaticResources: StaticResourcesOutput[] = StaticResourcesOutputFinder.findAll({
    outputs,
  }).filter(sr => sr.resourceType === CENTRAL_VPC_RESOURCE_TYPE);

  // Initiate previous stacks to handle deletion of previously deployed stack if there are no resources
  for (const sr of allStaticResources) {
    const localAccount = accounts.find(acc => acc.key === sr.accountKey);
    accountStacks.tryGetOrCreateAccountStack(
      sr.accountKey,
      sr.region,
      `${STACK_COMMON_SUFFIX}-${sr.suffix}`,
      localAccount?.inScope,
    );
  }

  // Initiate previous stacks to handle deletion of previously deployed stack if there are no resources
  for (const sr of centralVpcStaticResources) {
    const localAccount = accounts.find(acc => acc.key === sr.accountKey);
    accountStacks.tryGetOrCreateAccountStack(
      sr.accountKey,
      sr.region,
      STACK_CENTRAL_VPC_COMMON_SUFFIX,
      localAccount?.inScope,
    );
  }

  const accountStaticResourcesConfig: { [accountKey: string]: StaticResourcesOutput[] } = {};
  const accountRegionExistingResources: {
    [accountKey: string]: {
      [region: string]: string[];
    };
  } = {};
  const accountRegionMaxSuffix: {
    [accountKey: string]: {
      [region: string]: number;
    };
  } = {};

  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const resolversConfig = vpcConfig.resolvers;
    if (!resolversConfig) {
      console.debug(`Skipping resolver creation for VPC "${vpcConfig.name}" in account "${accountKey}"`);
      continue;
    }

    /**
     * Checking if current VPC is under Regional Central VPCs (global-options/zones),
     *  If yes then only we will share Rules from this account to another accounts
     */
    const isRuleShareNeeded = vpcConfig['central-endpoint'];
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

    let suffix: number;
    let stackSuffix: string;
    let newResource = true;
    const constructName = `${STACK_COMMON_SUFFIX}-${vpcConfig.name}`;

    // Load all account stacks to object
    if (!accountStaticResourcesConfig[accountKey]) {
      accountStaticResourcesConfig[accountKey] = allStaticResources.filter(sr => sr.accountKey === accountKey);
    }
    if (!accountRegionMaxSuffix[accountKey]) {
      accountRegionMaxSuffix[accountKey] = {};
    }

    // Load Max suffix for each region of account to object
    if (!accountRegionMaxSuffix[accountKey][vpcConfig.region]) {
      const localSuffix = accountStaticResourcesConfig[accountKey]
        .filter(sr => sr.region === vpcConfig.region)
        .flatMap(r => r.suffix);
      accountRegionMaxSuffix[accountKey][vpcConfig.region] = localSuffix.length === 0 ? 1 : Math.max(...localSuffix);
    }

    if (!accountRegionExistingResources[accountKey]) {
      const localRegionalResources = accountStaticResourcesConfig[accountKey]
        .filter(sr => sr.region === vpcConfig.region)
        .flatMap(sr => sr.resources);
      accountRegionExistingResources[accountKey] = {};
      accountRegionExistingResources[accountKey][vpcConfig.region] = localRegionalResources;
    } else if (!accountRegionExistingResources[accountKey][vpcConfig.region]) {
      const localRegionalResources = accountStaticResourcesConfig[accountKey]
        .filter(sr => sr.region === vpcConfig.region)
        .flatMap(sr => sr.resources);
      accountRegionExistingResources[accountKey][vpcConfig.region] = localRegionalResources;
    }

    suffix = accountRegionMaxSuffix[accountKey][vpcConfig.region];
    stackSuffix = `${STACK_COMMON_SUFFIX}-${suffix}`;
    const centralVpc = vpcConfig['central-endpoint'];
    if (centralVpc) {
      stackSuffix = STACK_CENTRAL_VPC_COMMON_SUFFIX;
    } else {
      if (accountRegionExistingResources[accountKey][vpcConfig.region].includes(constructName)) {
        newResource = false;
        const regionStacks = accountStaticResourcesConfig[accountKey].filter(sr => sr.region === vpcConfig.region);
        for (const rs of regionStacks) {
          if (rs.resources.includes(constructName)) {
            stackSuffix = `${STACK_COMMON_SUFFIX}-${rs.suffix}`;
            break;
          }
        }
      } else {
        const existingResources = accountStaticResourcesConfig[accountKey].find(
          sr => sr.region === vpcConfig.region && sr.suffix === suffix,
        );
        if (existingResources && existingResources.resources.length >= MAX_RESOURCES_IN_STACK) {
          accountRegionMaxSuffix[accountKey][vpcConfig.region] = ++suffix;
        }
        stackSuffix = `${STACK_COMMON_SUFFIX}-${suffix}`;
      }
    }
    const localAccount = accounts.find(acc => acc.key === accountKey);
    const accountStack = accountStacks.tryGetOrCreateAccountStack(
      accountKey,
      vpcConfig.region,
      stackSuffix,
      localAccount?.inScope,
    );
    if (!accountStack) {
      console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while deploying Resolver Endpoints`);
      continue;
    }

    // Call r53-resolver-endpoint per Account
    const r53ResolverEndpoints = new ResolverEndpoint(
      accountStack,
      `${STACK_COMMON_SUFFIX}-${accountKey}-${vpcConfig.name}`,
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
        const targetIps: TargetIp[] = onPremRuleConfig['outbound-ips'].map(ip => ({
          Ip: ip,
          Port: 53,
        }));
        const rule = new CreateResolverRule(accountStack, `${domainToName(onPremRuleConfig.zone)}-${vpcConfig.name}`, {
          domainName: onPremRuleConfig.zone,
          resolverEndpointId: r53ResolverEndpoints.outboundEndpointRef!,
          roleArn: roleOutput.roleArn,
          targetIps,
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
        const madOutput = getStackJsonOutput(outputs, {
          accountKey: madAccountKey,
          outputType: 'MadOutput',
        });
        if (madOutput.length === 0) {
          console.warn(`MAD is not deployed yet in account ${accountKey}`);
          continue;
        }
        const madIPs: string[] = madOutput[0].dnsIps.split(',');
        const targetIps: TargetIp[] = madIPs.map(ip => ({
          Ip: ip,
          Port: 53,
        }));

        const madRule = new CreateResolverRule(accountStack, `${domainToName(mad['dns-domain'])}-${vpcConfig.name}`, {
          domainName: mad['dns-domain'],
          resolverEndpointId: r53ResolverEndpoints.outboundEndpointRef!,
          roleArn: roleOutput.roleArn,
          targetIps,
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

    if (isRuleShareNeeded) {
      const regionVpcs = config
        .getVpcConfigs()
        .filter(
          vc =>
            vc.vpcConfig.region === vpcConfig.region &&
            vc.vpcConfig['use-central-endpoints'] &&
            vc.accountKey !== accountKey,
        );
      const sharedToAccountKeys = regionVpcs.map(rv => rv.accountKey);
      const sharedToAccountIds: string[] = sharedToAccountKeys.map(accId => getAccountId(accounts, accId)!);
      if (sharedToAccountIds.length > 0) {
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

    if (centralVpc) {
      const currentResourcesObject = {
        accountKey,
        id: `${CENTRAL_VPC_RESOURCE_TYPE}-${vpcConfig.region}-${accountKey}-${suffix}`,
        region: vpcConfig.region,
        resourceType: CENTRAL_VPC_RESOURCE_TYPE,
        resources: [`${STACK_CENTRAL_VPC_COMMON_SUFFIX}-${vpcConfig.name}`],
        // Setting sufix to -1 since will only have one Central VPC per region
        suffix: -1,
      };
      new CfnStaticResourcesOutput(
        accountStack,
        `CentralVpcResolverEndpointsOutput-${vpcConfig.name}`,
        currentResourcesObject,
      );
    }

    if (newResource && !centralVpc) {
      const currentSuffixIndex = allStaticResources.findIndex(
        sr => sr.region === vpcConfig.region && sr.suffix === suffix && sr.accountKey === accountKey,
      );
      const currentAccountSuffixIndex = accountStaticResourcesConfig[accountKey].findIndex(
        sr => sr.region === vpcConfig.region && sr.suffix === suffix,
      );
      if (currentSuffixIndex === -1) {
        const currentResourcesObject = {
          accountKey,
          id: `${RESOURCE_TYPE}-${vpcConfig.region}-${accountKey}-${suffix}`,
          region: vpcConfig.region,
          resourceType: RESOURCE_TYPE,
          resources: [constructName],
          suffix,
        };
        allStaticResources.push(currentResourcesObject);
        accountStaticResourcesConfig[accountKey].push(currentResourcesObject);
      } else {
        const currentResourcesObject = allStaticResources[currentSuffixIndex];
        const currentAccountResourcesObject = accountStaticResourcesConfig[accountKey][currentAccountSuffixIndex];
        if (!currentResourcesObject.resources.includes(constructName)) {
          currentResourcesObject.resources.push(constructName);
        }
        if (!currentAccountResourcesObject.resources.includes(constructName)) {
          currentAccountResourcesObject.resources.push(constructName);
        }
        allStaticResources[currentSuffixIndex] = currentResourcesObject;
        accountStaticResourcesConfig[accountKey][currentAccountSuffixIndex] = currentAccountResourcesObject;
      }
    }
  }
  for (const sr of allStaticResources) {
    const srLocalAccount = accounts.find(acc => acc.key === sr.accountKey);
    const accountStack = accountStacks.tryGetOrCreateAccountStack(
      sr.accountKey,
      sr.region,
      `${STACK_COMMON_SUFFIX}-${sr.suffix}`,
      srLocalAccount?.inScope,
    );
    if (!accountStack) {
      throw new Error(
        `Not able to get or create stack for ${sr.accountKey}: ${sr.region}: ${STACK_COMMON_SUFFIX}-${sr.suffix}`,
      );
    }
    new CfnStaticResourcesOutput(accountStack, `StaticResourceOutput-${sr.suffix}`, sr);
  }
}

function domainToName(domain: string): string {
  return domain.replace(/\./gi, '-');
}

export function createRuleName(name: string): string {
  const hash = hashPath([name], 8);
  if (name.length > 44) {
    name = name.substring(0, 44);
  }
  name = name + hash;
  return createName({
    name,
  });
}
