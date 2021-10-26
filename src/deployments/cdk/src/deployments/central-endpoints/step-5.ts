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
import { HostedZoneOutput, HostedZoneOutputFinder } from '@aws-accelerator/common-outputs/src/hosted-zone';
import { Account, getAccountId } from '../../utils/accounts';
import { DisAssociateHostedZones } from '@aws-accelerator/custom-resource-disassociate-hosted-zones';
import * as cdk from '@aws-cdk/core';

export interface CentralEndpointsStep5Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  accounts: Account[];
  executionRole: string;
  assumeRole: string;
}

/**
 *  - Disassociate Central Regional Hosted Zones to Regional Vpcs if those are newly added to Local VPC in phases-1 and create local Endpoint and HostedZone in Phase-2
 *  - If we remove Interface endpoint in Local VPC that gets removed in Phase-2 stack and Associate to Central Regional Hosted Zones happens in Phase-4 Master Account (No Changes required)
 * Note: If use-central-endpoints: false and also added one regional Interface endpoint to Local VPC, Will fail we need to perform in two steps since we don't have track on "use-central-endpoints" flag
 *   1. Add required Interface endpoint first so that we disassociate from regional Hosted Zone in Phase-1 and create one in Phase-2
 *   2. Change use-cenral-endopints: false, So that we disassociate all endpoint Hosted  Zones to vpc
 */
export async function step5(props: CentralEndpointsStep5Props) {
  const { accountStacks, config, outputs, accounts, assumeRole, executionRole } = props;
  const allVpcConfigs = config.getVpcConfigs();
  const masterAccountKey = config['global-options']['aws-org-management'].account;

  const regionalZoneOutputs: { [regino: string]: HostedZoneOutput[] } = {};
  for (const { accountKey, vpcConfig } of allVpcConfigs) {
    if (!vpcConfig['use-central-endpoints']) {
      // This is handled in Phase-4 Master account Stack
      continue;
    }

    if (!c.InterfaceEndpointConfig.is(vpcConfig['interface-endpoints'])) {
      // No Local Interface endpoints to VPC, Ignoring DisAssociation
      continue;
    }

    // Interface Endpoints local to VPC based on config (Current Execution)
    const endpointsConfig = vpcConfig['interface-endpoints'].endpoints;

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

    const accountStack = accountStacks.tryGetOrCreateAccountStack(masterAccountKey, vpcConfig.region);
    if (!accountStack) {
      console.error(
        `Cannot find account stack ${accountKey}: ${vpcConfig.region}, while DisAssociating Resolver Rules`,
      );
      continue;
    }

    const centralEndpointConfig = allVpcConfigs.find(
      vc => vc.vpcConfig.region === vpcConfig.region && vc.vpcConfig['central-endpoint'],
    );

    if (!centralEndpointConfig) {
      // There is no reginoal Zone config in global options for this region, No need of seperate DisAssociation
      continue;
    }

    if (!regionalZoneOutputs[vpcConfig.region]) {
      regionalZoneOutputs[vpcConfig.region] = HostedZoneOutputFinder.findAllEndpointsByAccountRegionVpcAndType({
        outputs,
        accountKey: centralEndpointConfig.accountKey,
        region: vpcConfig.region,
        vpcName: centralEndpointConfig.vpcConfig.name,
      });
    }

    if (!c.InterfaceEndpointConfig.is(centralEndpointConfig.vpcConfig['interface-endpoints'])) {
      // No Regional Interface endpoints to VPC, Ignoring DisAssociation
      continue;
    }

    // Interface Endpoints created regional to VPC based on config (Current Execution)
    const regionalInterfaceEndpoints = centralEndpointConfig.vpcConfig['interface-endpoints'].endpoints;

    const prevInterfaceEndpoints = HostedZoneOutputFinder.findAllEndpointsByAccountRegionVpcAndType({
      outputs,
      accountKey,
      region: vpcConfig.region,
      vpcName: vpcConfig.name,
    });
    // Interface Endpoints created local to VPC in previous execution
    const prevInterfaceEndpointNames = prevInterfaceEndpoints.map(ep => ep.serviceName);
    const newEndpoints = endpointsConfig.filter(ed => prevInterfaceEndpointNames.indexOf(ed) < 0);
    const regionalDisAsscociateEndpoints = newEndpoints.filter(ed => regionalInterfaceEndpoints.indexOf(ed) >= 0);
    const vpcAccountId = getAccountId(accounts, accountKey)!;
    if (regionalDisAsscociateEndpoints.length > 0) {
      const regionalEndpointZoneIds: string[] = [];
      regionalDisAsscociateEndpoints.map(serviceName =>
        regionalEndpointZoneIds.push(
          regionalZoneOutputs[vpcConfig.region].find(ep => ep.serviceName === serviceName)?.hostedZoneId!,
        ),
      );
      const hostedZoneAccountId = getAccountId(accounts, centralEndpointConfig.accountKey)!;
      new DisAssociateHostedZones(accountStack, `DisAssociateRemoteEndpointZones-${vpcConfig.name}-${accountKey}`, {
        assumeRoleName: assumeRole,
        vpcAccountId,
        vpcName: vpcConfig.name,
        vpcId: vpcOutput.vpcId,
        vpcRegion: vpcConfig.region,
        hostedZoneAccountId,
        hostedZoneIds: regionalEndpointZoneIds,
        roleArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${executionRole}`,
      });
    }
  }
}
