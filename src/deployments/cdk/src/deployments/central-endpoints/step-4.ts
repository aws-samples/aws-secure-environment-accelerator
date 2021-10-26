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

import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import * as c from '@aws-accelerator/common-config';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { HostedZoneOutputFinder } from '@aws-accelerator/common-outputs/src/hosted-zone';
import { Account, getAccountId } from '../../utils/accounts';
import { AssociateHostedZones } from '@aws-accelerator/custom-resource-associate-hosted-zones';
import * as cdk from '@aws-cdk/core';
import {
  StaticResourcesOutputFinder,
  StaticResourcesOutput,
} from '@aws-accelerator/common-outputs/src/static-resource';
import { CfnStaticResourcesOutput } from './outputs';

// Changing this will result to redeploy most of the stack
const MAX_RESOURCES_IN_STACK = 190;
const RESOURCE_TYPE = 'HostedZoneAssociation';
const STACK_COMMON_SUFFIX = 'HostedZonesAssc';

export interface CentralEndpointsStep4Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  accounts: Account[];
  executionRole: string;
  assumeRole: string;
}

/**
 *  Associate VPC to Hosted Zones to Vpcs based on use-central-endpoints
 */
export async function step4(props: CentralEndpointsStep4Props) {
  const { accountStacks, config, outputs, accounts, assumeRole, executionRole } = props;
  const allVpcConfigs = config.getVpcConfigs();

  const globalPrivateHostedZoneIds: { [accountKey: string]: string[] } = {};

  const centralZones = allVpcConfigs.filter(
    vc => vc.vpcConfig['central-endpoint'] && vc.vpcConfig.zones && vc.vpcConfig.zones.private.length > 0,
  );
  const masterAccountKey = config['global-options']['aws-org-management'].account;
  for (const centralZone of centralZones) {
    const hostedZoneOutputs = HostedZoneOutputFinder.findAll({
      outputs,
      accountKey: centralZone.accountKey,
      region: centralZone.vpcConfig.region,
    });
    const centralVpcHostedZones = hostedZoneOutputs.filter(hzo => hzo.vpcName === centralZone.vpcConfig.name);
    if (centralVpcHostedZones) {
      if (!globalPrivateHostedZoneIds[centralZone.accountKey]) {
        globalPrivateHostedZoneIds[centralZone.accountKey] = centralVpcHostedZones
          .filter(cvh => centralZone.vpcConfig.zones?.private.includes(cvh.domain))
          .map(hz => hz.hostedZoneId);
      } else {
        globalPrivateHostedZoneIds[centralZone.accountKey].push(
          ...centralVpcHostedZones
            .filter(cvh => centralZone.vpcConfig.zones?.private.includes(cvh.domain))
            .map(hz => hz.hostedZoneId),
        );
      }
    }
  }

  const staticResources: StaticResourcesOutput[] = StaticResourcesOutputFinder.findAll({
    outputs,
    accountKey: masterAccountKey,
  }).filter(sr => sr.resourceType === RESOURCE_TYPE);

  // Initiate previous stacks to handle deletion of previously deployed stack if there are no resources
  for (const sr of staticResources) {
    const srLocalAccount = accounts.find(acc => acc.key === sr.accountKey);
    accountStacks.tryGetOrCreateAccountStack(
      sr.accountKey,
      sr.region,
      `${STACK_COMMON_SUFFIX}-${sr.suffix}`,
      srLocalAccount?.inScope,
    );
  }

  const existingRegionResources: { [region: string]: string[] } = {};
  const supportedregions = config['global-options']['supported-regions'];

  const regionalMaxSuffix: { [region: string]: number } = {};
  supportedregions.forEach(reg => {
    const localSuffix = staticResources.filter(sr => sr.region === reg).flatMap(r => r.suffix);
    regionalMaxSuffix[reg] = localSuffix.length === 0 ? 1 : Math.max(...localSuffix);
  });

  supportedregions.forEach(reg => {
    existingRegionResources[reg] = staticResources.filter(sr => sr.region === reg).flatMap(r => r.resources);
  });

  for (const { accountKey, vpcConfig } of allVpcConfigs) {
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
      console.warn(`Cannot find VPC "${vpcConfig.name}" in outputs`);
      continue;
    }

    let suffix = regionalMaxSuffix[vpcConfig.region];
    const existingResources = staticResources.find(sr => sr.region === vpcConfig.region && sr.suffix === suffix);

    if (existingResources && existingResources.resources.length >= MAX_RESOURCES_IN_STACK) {
      regionalMaxSuffix[vpcConfig.region] = ++suffix;
    }

    let stackSuffix = `${STACK_COMMON_SUFFIX}-${suffix}`;
    let updateOutputsRequired = true;
    const constructName = `AssociateHostedZones-${accountKey}-${vpcConfig.name}-${vpcConfig.region}`;
    if (existingRegionResources[vpcConfig.region].includes(constructName)) {
      updateOutputsRequired = false;
      const regionStacks = staticResources.filter(sr => sr.region === vpcConfig.region);
      for (const rs of regionStacks) {
        if (rs.resources.includes(constructName)) {
          stackSuffix = `${STACK_COMMON_SUFFIX}-${rs.suffix}`;
          break;
        }
      }
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(
      masterAccountKey,
      vpcConfig.region,
      stackSuffix,
      true,
    );
    if (!accountStack) {
      console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while Associating Resolver Rules`);
      continue;
    }

    const vpcAccountId = getAccountId(accounts, accountKey)!;

    const regionalCentralEndpoint = allVpcConfigs.find(
      vc => vc.vpcConfig.region === vpcConfig.region && vc.vpcConfig['central-endpoint'],
    );
    const hostedZoneIds: string[] = [];
    if (regionalCentralEndpoint) {
      // Retriving Hosted Zone ids for interface endpoints to be shared
      if (!vpcConfig['central-endpoint']) {
        hostedZoneIds.push(...getHostedZoneIds(regionalCentralEndpoint, vpcConfig, outputs));
      }
      if (globalPrivateHostedZoneIds[regionalCentralEndpoint.accountKey]) {
        hostedZoneIds.push(...globalPrivateHostedZoneIds[regionalCentralEndpoint.accountKey]);
      }
      const hostedZoneAccountId = getAccountId(accounts, regionalCentralEndpoint.accountKey)!;
      new AssociateHostedZones(accountStack, constructName, {
        assumeRoleName: assumeRole,
        vpcAccountId,
        vpcName: vpcConfig.name,
        vpcId: vpcOutput.vpcId,
        vpcRegion: vpcConfig.region,
        hostedZoneAccountId,
        hostedZoneIds,
        roleArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${executionRole}`,
      });
    }

    for (const [hAccountKey, hostedZoneIds] of Object.entries(globalPrivateHostedZoneIds)) {
      if (regionalCentralEndpoint && regionalCentralEndpoint.accountKey === hAccountKey) {
        continue;
      }
      const hostedZoneAccountId = getAccountId(accounts, hAccountKey)!;
      new AssociateHostedZones(
        accountStack,
        `AssociatePrivateZones-${hAccountKey}-${vpcConfig.name}-${vpcConfig.region}`,
        {
          assumeRoleName: assumeRole,
          vpcAccountId,
          vpcName: vpcConfig.name,
          vpcId: vpcOutput.vpcId,
          vpcRegion: vpcConfig.region,
          hostedZoneAccountId,
          hostedZoneIds,
          roleArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${executionRole}`,
        },
      );
    }

    // Update stackResources Object if new resource came
    if (updateOutputsRequired) {
      const currentSuffixIndex = staticResources.findIndex(
        sr => sr.region === vpcConfig.region && sr.suffix === suffix,
      );
      const vpcAssociationResources = [constructName];
      vpcAssociationResources.push(
        ...Object.keys(globalPrivateHostedZoneIds).map(
          hAccountKey => `AssociatePrivateZones-${hAccountKey}-${vpcConfig.name}-${vpcConfig.region}`,
        ),
      );
      if (currentSuffixIndex === -1) {
        const currentResourcesObject = {
          accountKey: masterAccountKey,
          id: `${STACK_COMMON_SUFFIX}-${vpcConfig.region}-${masterAccountKey}-${suffix}`,
          region: vpcConfig.region,
          resourceType: RESOURCE_TYPE,
          resources: [constructName],
          suffix,
        };
        currentResourcesObject.resources.push(
          ...Object.keys(globalPrivateHostedZoneIds).map(
            hAccountKey => `AssociatePrivateZones-${hAccountKey}-${vpcConfig.name}-${vpcConfig.region}`,
          ),
        );

        staticResources.push(currentResourcesObject);
      } else {
        const currentResourcesObject = staticResources[currentSuffixIndex];
        currentResourcesObject.resources.push(constructName);
        staticResources[currentSuffixIndex] = currentResourcesObject;
      }
    }
  }

  for (const sr of staticResources) {
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

function getHostedZoneIds(
  centralEndpointVpc: c.ResolvedVpcConfig,
  vpcConfig: c.VpcConfig,
  outputs: StackOutput[],
): string[] {
  const centralEndpoints: string[] = [];
  const localEndpoints: string[] = [];

  // Get Endpoints from Central VPC Config
  if (c.InterfaceEndpointConfig.is(centralEndpointVpc.vpcConfig['interface-endpoints'])) {
    centralEndpoints.push(...centralEndpointVpc.vpcConfig['interface-endpoints'].endpoints);
  }

  // Get Endpoints from Local VPC Config
  if (c.InterfaceEndpointConfig.is(vpcConfig['interface-endpoints'])) {
    localEndpoints.push(...vpcConfig['interface-endpoints'].endpoints);
  }
  const shareableEndpoints = centralEndpoints.filter(ce => !localEndpoints.includes(ce));
  const hostedZoneIds: string[] = [];
  const regionalHostedZoneOutputs = HostedZoneOutputFinder.findAll({
    outputs,
    accountKey: centralEndpointVpc.accountKey,
    region: centralEndpointVpc.vpcConfig.region,
  });
  const vpcHostedZoneOutputs = regionalHostedZoneOutputs.filter(hz => hz.vpcName === centralEndpointVpc.vpcConfig.name);
  hostedZoneIds.push(
    ...vpcHostedZoneOutputs
      .filter(hz => hz.serviceName && shareableEndpoints.includes(hz.serviceName))
      .map(h => h.hostedZoneId),
  );
  return hostedZoneIds;
}
