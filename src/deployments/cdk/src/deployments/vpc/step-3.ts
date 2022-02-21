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

import { AcceleratorConfig, InterfaceEndpointConfig } from '@aws-accelerator/common-config';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import {
  StaticResourcesOutput,
  StaticResourcesOutputFinder,
} from '@aws-accelerator/common-outputs/src/static-resource';
import { AccountStacks } from '../../common/account-stacks';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { CfnHostedZoneOutput, CfnStaticResourcesOutput } from '../central-endpoints';
import { InterfaceEndpoint } from '../../common/interface-endpoints';
import { pascalCase } from 'pascal-case';
import { Limit, Limiter } from '../../utils/limits';
import { HostedZoneOutputFinder } from '@aws-accelerator/common-outputs/src/hosted-zone';
import { Account } from '../../utils/accounts';

// Changing this will result to redeploy most of the stack
const MAX_RESOURCES_IN_STACK = 30;
const RESOURCE_TYPE = 'INTERFACE_ENDPOINTS';
const STACK_SUFFIX = 'VPCEndpoints';

interface VpcStep3Props {
  config: AcceleratorConfig;
  outputs: StackOutput[];
  accountStacks: AccountStacks;
  limiter: Limiter;
  accounts: Account[];
}

export async function step3(props: VpcStep3Props) {
  const { config, outputs, accountStacks, limiter, accounts } = props;
  const allStaticResources = StaticResourcesOutputFinder.findAll({
    outputs,
  }).filter(sr => sr.resourceType === RESOURCE_TYPE);
  const portOverrides = config['global-options']['endpoint-port-overrides'];

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

  // Initiate previous stacks to handle deletion of previously deployed stack if there are no resources
  for (const sr of allStaticResources) {
    const srLocalAccount = accounts.find(acc => acc.key === sr.accountKey);
    accountStacks.tryGetOrCreateAccountStack(
      sr.accountKey,
      sr.region,
      `${STACK_SUFFIX}-${sr.suffix}`,
      srLocalAccount?.inScope,
    );
  }

  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (!InterfaceEndpointConfig.is(vpcConfig['interface-endpoints'])) {
      continue;
    }
    const endpointsConfig = vpcConfig['interface-endpoints'];

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

    let suffix: number;
    let stackSuffix: string;

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

    const regionStacks = accountStaticResourcesConfig[accountKey].filter(sr => sr.region === vpcConfig.region);

    // Get Account & Region Current Max Suffix and update it when it is changed
    suffix = accountRegionMaxSuffix[accountKey][vpcConfig.region];
    stackSuffix = `${STACK_SUFFIX}-${suffix}`;

    const hostedZoneOutputs = HostedZoneOutputFinder.findAll({
      outputs,
      accountKey,
      region: vpcConfig.region,
    });
    const prevVpcEndpoints = hostedZoneOutputs
      .filter(phz => phz.zoneType === 'PRIVATE' && phz.vpcName === vpcConfig.name && !!phz.serviceName)
      .map(hz => hz.serviceName);
    const removedVpcEndpoints = prevVpcEndpoints.filter(ed => endpointsConfig.endpoints.indexOf(ed!) < 0);
    removedVpcEndpoints.map(() => {
      // Increasing Limiter to handle removed Interface endpoints from config w.r.t InterfaceEndpoints limits
      limiter.create(accountKey, Limit.VpcInterfaceEndpointsPerVpc, vpcConfig.region, vpcConfig.name);
    });
    for (const endpoint of endpointsConfig.endpoints) {
      let newResource = true;
      if (!limiter.create(accountKey, Limit.VpcInterfaceEndpointsPerVpc, vpcConfig.region, vpcConfig.name)) {
        console.log(
          `Skipping endpoint "${endpoint}" creation in VPC "${vpcConfig.name}". Reached maximum interface endpoints per VPC`,
          accountKey,
          vpcConfig.region,
        );
        continue;
      }
      const constructName = `${STACK_SUFFIX}-${vpcConfig.name}-${endpoint}`;
      if (accountRegionExistingResources[accountKey][vpcConfig.region].includes(constructName)) {
        newResource = false;
        const currentStaticResource = regionStacks.find(rs => rs.resources.includes(constructName));
        if (currentStaticResource) {
          stackSuffix = `${STACK_SUFFIX}-${currentStaticResource.suffix}`;
        }
      } else {
        const existingResources = accountStaticResourcesConfig[accountKey].find(
          sr => sr.region === vpcConfig.region && sr.suffix === suffix,
        );
        if (existingResources && existingResources.resources.length >= MAX_RESOURCES_IN_STACK) {
          // Updating Account & Region Max Suffix
          accountRegionMaxSuffix[accountKey][vpcConfig.region] = ++suffix;
        }
        stackSuffix = `${STACK_SUFFIX}-${suffix}`;
      }

      const loocalAccount = accounts.find(acc => acc.key === accountKey);
      const accountStack = accountStacks.tryGetOrCreateAccountStack(
        accountKey,
        vpcConfig.region,
        stackSuffix,
        loocalAccount?.inScope,
      );
      if (!accountStack) {
        console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while Associating Resolver Rules`);
        continue;
      }
      const interfaceEndpoint = new InterfaceEndpoint(
        accountStack,
        `Endpoint-${vpcConfig.name}-${pascalCase(endpoint)}`,
        {
          serviceName: endpoint,
          vpcId: vpcOutput.vpcId,
          vpcRegion: vpcConfig.region,
          subnetIds: vpcOutput.subnets.filter(sn => sn.subnetName === endpointsConfig.subnet).map(s => s.subnetId),
          allowedCidrs: endpointsConfig['allowed-cidrs']?.map(c => c.toCidrString()),
          ports: portOverrides?.[endpoint],
        },
      );

      new CfnHostedZoneOutput(accountStack, `HostedZoneOutput-${vpcConfig.name}-${pascalCase(endpoint)}`, {
        accountKey,
        domain: interfaceEndpoint.hostedZone.name!,
        hostedZoneId: interfaceEndpoint.hostedZone.ref,
        region: vpcConfig.region,
        zoneType: 'PRIVATE',
        serviceName: endpoint,
        vpcName: vpcConfig.name,
      });

      if (newResource) {
        const currentSuffixIndex = allStaticResources.findIndex(
          sr => sr.region === vpcConfig.region && sr.suffix === suffix && sr.accountKey === accountKey,
        );
        const currentAccountSuffixIndex = accountStaticResourcesConfig[accountKey].findIndex(
          sr => sr.region === vpcConfig.region && sr.suffix === suffix,
        );
        if (currentSuffixIndex === -1) {
          const currentResourcesObject: StaticResourcesOutput = {
            accountKey,
            id: `${STACK_SUFFIX}-${vpcConfig.region}-${accountKey}-${suffix}`,
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
  }
  for (const sr of allStaticResources) {
    const srLocalAccount = accounts.find(acc => acc.key === sr.accountKey);
    const accountStack = accountStacks.tryGetOrCreateAccountStack(
      sr.accountKey,
      sr.region,
      `${STACK_SUFFIX}-${sr.suffix}`,
      srLocalAccount?.inScope,
    );
    if (!accountStack) {
      throw new Error(
        `Not able to get or create stack for ${sr.accountKey}: ${sr.region}: ${STACK_SUFFIX}-${sr.suffix}`,
      );
    }
    new CfnStaticResourcesOutput(accountStack, `StaticResourceOutput-${sr.suffix}`, sr);
  }
}
