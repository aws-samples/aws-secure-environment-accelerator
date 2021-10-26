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

import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../../common/account-stacks';
import { FirewallPort, CfnFirewallPortOutput } from './outputs';

export interface FirewallStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

/**
 * Creates the EIPs for the firewall instances.
 *
 * This step outputs the following:
 *   - Firewall ports with EIPs for all accounts with a firewall deployment
 */
export async function step1(props: FirewallStep1Props) {
  const { accountStacks, config } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const firewallConfigs = accountConfig.deployments?.firewalls;
    if (!firewallConfigs || firewallConfigs.length === 0) {
      continue;
    }

    for (const firewallConfig of firewallConfigs.filter(firewall => c.FirewallEC2ConfigType.is(firewall))) {
      if (!firewallConfig.deploy) {
        console.log(`Deploy set to false for "${firewallConfig.name}"`);
        continue;
      }
      if (!c.FirewallEC2ConfigType.is(firewallConfig)) {
        continue;
      }
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, firewallConfig.region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }

      const vpcConfigs = config.getVpcConfigs();
      const vpcConfig = vpcConfigs.map(obj => obj.vpcConfig).find(v => v.name === firewallConfig.vpc);
      if (!vpcConfig) {
        console.log(`Skipping firewall deployment because of missing VPC "${firewallConfig.vpc}"`);
        continue;
      }

      await createFirewallEips({
        scope: accountStack,
        vpcConfig,
        firewallConfig,
      });
    }
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFirewallEips(props: {
  scope: cdk.Construct;
  vpcConfig: c.VpcConfig;
  firewallConfig: c.FirewallEC2ConfigType;
}) {
  const { scope, vpcConfig, firewallConfig } = props;

  const firewallCgwName = firewallConfig['fw-cgw-name'];

  // Keep track of the created ports and EIPs so we can use them in the next steps
  const ports: FirewallPort[] = [];

  // Create a firewall EIP in every availability zone
  const subnetDefinitions = vpcConfig.subnets?.flatMap(s => s.definitions) || [];
  const azs = subnetDefinitions.map(def => def.az);
  for (const az of new Set(azs)) {
    for (const [index, port] of Object.entries(firewallConfig.ports)) {
      let eip;
      if (port['create-eip']) {
        eip = new ec2.CfnEIP(scope, `${firewallCgwName}_az${pascalCase(az)}_${index}_eip`, {
          domain: 'vpc',
        });
      }

      ports.push({
        firewallName: firewallConfig.name,
        name: port.name,
        subnetName: port.subnet,
        az,
        eipIpAddress: eip?.ref,
        eipAllocationId: eip?.attrAllocationId,
        createCustomerGateway: port['create-cgw'],
      });
    }
  }

  new CfnFirewallPortOutput(scope, `FirewallPortOutput${firewallConfig.name}`, ports);
}
