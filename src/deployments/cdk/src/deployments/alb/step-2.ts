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

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { AcceleratorConfig, ResolvedVpcConfig, GwlbConfigType } from '@aws-accelerator/common-config/src';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { AccountStacks } from '../../common/account-stacks';
import { LoadBalancerOutputFinder } from '@aws-accelerator/common-outputs/src/elb';
import { CfnLoadBalancerEndpointOutput } from './outputs';

interface ElbEndpoint {
  az: string;
  id: string;
  vpc: string;
  subnet: string;
  accountKey: string;
}

export interface ElbStep2Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
}

export async function step2(props: ElbStep2Props) {
  const { accountStacks, config, outputs } = props;

  const vpcConfigs = config.getVpcConfigs();
  for (const { ouKey, accountKey, albs: elbConfigs } of config.getElbConfigs()) {
    if (elbConfigs.length === 0) {
      continue;
    }
    if (ouKey) {
      const accountConfigs = config.getAccountConfigsForOu(ouKey);
      const accountConfig = accountConfigs.find(([aKey, _]) => aKey === accountKey);
      if (accountConfig && accountConfig[1]['exclude-ou-albs']) {
        continue;
      }
    }

    for (const elbConfig of elbConfigs) {
      const vpcConfig = vpcConfigs.find(v => v.vpcConfig.name === elbConfig.vpc)?.vpcConfig;
      if (!vpcConfig) {
        console.warn(`Cannot find vpc config with name ${elbConfig.vpc}`);
        continue;
      }

      if (elbConfig.type === 'GWLB') {
        createEndpoints({
          accountKey,
          accountStacks,
          elbConfig,
          outputs,
          vpcConfigs,
        });
      }
    }
  }
}

const createEndpoints = (props: {
  outputs: StackOutput[];
  accountStacks: AccountStacks;
  accountKey: string;
  vpcConfigs: ResolvedVpcConfig[];
  elbConfig: GwlbConfigType;
}) => {
  const { accountKey, accountStacks, outputs, vpcConfigs, elbConfig } = props;

  const elbOutput = LoadBalancerOutputFinder.tryFindOneByName({
    outputs,
    accountKey,
    name: elbConfig.name,
  });
  if (!elbOutput) {
    console.warn(`Didn't find output for GWLB : "${elbConfig.name}"`);
    return;
  }
  const serviceId = elbOutput.arn;
  const endpointSubnets = elbConfig['endpoint-subnets'];
  const endpoints: ElbEndpoint[] = [];
  for (const endpointSubnet of endpointSubnets) {
    const endpointVpcAccountKey = endpointSubnet.account === 'local' ? accountKey : endpointSubnet.account;
    const endpointResolvedVpcConfig = vpcConfigs.find(
      (r: ResolvedVpcConfig) => r.accountKey === endpointVpcAccountKey && r.vpcConfig.name === endpointSubnet.vpc,
    );
    const endpointVpcConfig = endpointResolvedVpcConfig?.vpcConfig;
    if (!endpointVpcConfig) {
      console.warn(`Endpoint Subnet VPC config not found for "${JSON.stringify(endpointSubnet)}"`);
      continue;
    }
    const { name: vpcName, region: vpcRegion } = endpointVpcConfig;
    const vpcAccountKey = endpointResolvedVpcConfig?.accountKey;
    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      vpcName,
      region: vpcRegion,
      accountKey: vpcAccountKey,
    });
    if (!vpcOutput) {
      console.warn(`Didn't find outputs for VPC "${vpcAccountKey}/${vpcRegion}/${vpcName}"`);
      continue;
    }

    const endpointSubnetConfig = endpointVpcConfig.subnets?.find(s => s.name === endpointSubnet.subnet);
    if (!endpointSubnetConfig) {
      console.warn(`Endpoint Subnet config not found for "${JSON.stringify(endpointSubnet)}"`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(vpcAccountKey, vpcRegion);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${vpcAccountKey}`);
      continue;
    }

    for (const endpointSubnetDef of endpointSubnetConfig.definitions) {
      if (endpointSubnetDef.disabled) {
        continue;
      }
      const subnetOutput = vpcOutput.subnets.find(
        vs => vs.subnetName === endpointSubnetConfig.name && vs.az === endpointSubnetDef.az,
      );
      if (!subnetOutput) {
        console.warn(
          `Didn't find outputs for Subnet "${vpcAccountKey}/${endpointVpcConfig.region}/${endpointVpcConfig.name}/${endpointSubnetConfig.name}/${endpointSubnetDef.az}"`,
        );
        continue;
      }
      const suffix = `${elbConfig.name}-${vpcName}-${endpointSubnetConfig.name}-${endpointSubnetDef.az}`;

      const endpoint = new ec2.CfnVPCEndpoint(accountStack, `GwlbVpcEndpoint-${suffix}`, {
        serviceName: elbOutput.dnsName,
        vpcId: vpcOutput.vpcId,
        subnetIds: [subnetOutput.subnetId],
        vpcEndpointType: 'GatewayLoadBalancer',
      });

      new CfnLoadBalancerEndpointOutput(accountStack, `GwlbVpcEndpoint-${suffix}-Output`, {
        accountKey: vpcAccountKey,
        region: vpcRegion,
        elbName: elbConfig.name,
        elbAccountKey: accountKey,
        az: endpointSubnetDef.az,
        subnet: endpointSubnetConfig.name,
        vpc: vpcName,
        id: endpoint.ref,
        serviceId: elbOutput.hostedZoneId!,
      });
    }
  }
};
