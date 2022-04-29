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

import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { AccountStacks } from '../../common/account-stacks';
import { LoadBalancerEndpointOutputFinder } from '@aws-accelerator/common-outputs/src/elb';
import * as ec2 from '@aws-cdk/aws-ec2';

export interface ElbStep4Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
}

export async function step4(props: ElbStep4Props) {
  const { accountStacks, config, outputs } = props;

  const vpcConfigs = config.getVpcConfigs();
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      vpcName: vpcConfig.name,
      region: vpcConfig.region,
      accountKey,
    });
    if (!vpcOutput) {
      console.warn(`Cannot find output with vpc name ${vpcConfig.name}`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }
    const routeTablesConfig = vpcConfig['route-tables'] || [];
    for (const subnetConfig of vpcConfig.subnets || []) {
      for (const subnetDef of subnetConfig.definitions) {
        if (subnetDef.disabled) {
          continue;
        }
        const gwlbRoute = !!routeTablesConfig.find(
          rt => rt.name === subnetDef['route-table'] && !!rt.routes?.find(r => r.target === 'GWLB'),
        );
        if (!gwlbRoute) {
          continue;
        }
        const routeTableId = vpcOutput.routeTables[subnetDef['route-table']];
        const subnetRouteTableConfig = routeTablesConfig.find(rtc => rtc.name === subnetDef['route-table'])!;
        for (const routeConfig of subnetRouteTableConfig.routes || []) {
          if (routeConfig.target !== 'GWLB') {
            continue;
          }
          if (routeConfig.az && subnetDef.az !== routeConfig.az) {
            continue;
          }
          const elbEndpointOutput = LoadBalancerEndpointOutputFinder.tryFindOneByName({
            outputs,
            accountKey,
            elbName: routeConfig.name!,
            az: subnetDef.az,
            region: vpcConfig.region,
            vpcName: vpcConfig.name,
          });
          if (!elbEndpointOutput) {
            console.warn(`Didn't find ELB Endpoint output for Gwlb : "${routeConfig.name}"`);
            continue;
          }
          if (!elbEndpointOutput) {
            console.warn(`Didn't find vpc endpoint output for "${accountKey}/${vpcConfig.name}/${subnetDef.az}"`);
            continue;
          }
          const destinationCidrBlock = (routeConfig.destination as unknown) as string;
          new ec2.CfnRoute(
            accountStack,
            `Gwlb-route-${vpcConfig.name}-${subnetConfig.name}-${subnetDef.az}-${destinationCidrBlock}`,
            {
              routeTableId,
              destinationCidrBlock,
              vpcEndpointId: elbEndpointOutput.id,
            },
          );
        }
      }
    }
  }
}
