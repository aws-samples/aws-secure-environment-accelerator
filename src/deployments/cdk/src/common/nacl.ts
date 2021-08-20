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

import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import * as config from '@aws-accelerator/common-config/src';
import * as t from '@aws-accelerator/common-types';
import { AzSubnets } from './vpc';
import {
  AssignedSubnetCidrPool,
  AssignedVpcCidrPool,
  getSubnetCidrPools,
} from '@aws-accelerator/common-outputs/src/cidr-pools';

export interface NaclProps {
  accountKey: string;
  vpcConfig: config.VpcConfig;
  vpcId: string;
  subnetConfig: config.SubnetConfig;
  subnets: AzSubnets;
  vpcConfigs: config.ResolvedVpcConfig[];
  vpcPools: AssignedVpcCidrPool[];
  subnetPools: AssignedSubnetCidrPool[];
}

export class Nacl extends cdk.Construct {
  constructor(parent: cdk.Construct, name: string, props: NaclProps) {
    super(parent, name);
    const { accountKey, vpcConfig, vpcId, subnetConfig, subnets, vpcConfigs, vpcPools, subnetPools } = props;
    const naclRules = subnetConfig.nacls;
    if (!naclRules) {
      return;
    }

    const nacl = new ec2.CfnNetworkAcl(this, `Nacl-${vpcConfig.name}-${subnetConfig.name}`, {
      vpcId,
    });
    cdk.Tags.of(nacl).add('Name', `${subnetConfig.name}_${vpcConfig.name}_nacl`, { priority: 1000 });

    const localSubnetDefinitions = subnetConfig.definitions;
    for (const sd of localSubnetDefinitions) {
      if (sd.disabled) {
        continue;
      }
      new ec2.CfnSubnetNetworkAclAssociation(this, `NACL-Attachment-${subnetConfig.name}-${sd.az}`, {
        networkAclId: nacl.ref,
        subnetId: subnets.getAzSubnetIdForNameAndAz(subnetConfig.name, sd.az)!,
      });
    }
    for (const [index, rules] of naclRules.entries()) {
      let ruleNumber = rules.rule;
      const portRange: ec2.CfnNetworkAclEntry.PortRangeProperty = {
        from: rules.ports,
        to: rules.ports,
      };
      for (const cidr of rules['cidr-blocks']) {
        if (t.nonEmptyString.is(cidr)) {
          const aclEntryProps: ec2.CfnNetworkAclEntryProps = {
            networkAclId: nacl.ref,
            protocol: rules.protocol,
            ruleAction: rules['rule-action'],
            ruleNumber,
            portRange,
            cidrBlock: cidr,
            egress: rules.egress,
          };
          new ec2.CfnNetworkAclEntry(this, `Nacl-Rule-Cidr-${vpcConfig.name}-${index + 1}`, aclEntryProps);
          ruleNumber = ruleNumber + 200;
        } else {
          const vpcAccountKey = cidr.account ? cidr.account : accountKey;
          const ruleResolvedVpcConfig = vpcConfigs.find(
            x => x.vpcConfig.name === cidr.vpc && x.accountKey === vpcAccountKey,
          );
          const ruleVpcConfig = vpcConfigs.find(x => x.vpcConfig.name === cidr.vpc && x.accountKey === vpcAccountKey)
            ?.vpcConfig;
          if (!ruleVpcConfig) {
            console.warn(`VPC Not Found in Config "${cidr.vpc}"`);
            continue;
          }
          for (const [id, subnetName] of cidr.subnet.entries()) {
            const cidrSubnet = ruleVpcConfig.subnets?.find(s => s.name === subnetName);
            if (!cidrSubnet) {
              console.warn(`Subnet config for "${subnetName}" is not found in Accelerator Config`);
              continue;
            }
            const ruleVpcSubnets: AssignedSubnetCidrPool[] = [];
            if (vpcAccountKey !== accountKey || vpcConfig.name !== cidr.vpc) {
              ruleVpcSubnets.push(
                ...getSubnetCidrPools({
                  subnetPools,
                  accountKey: vpcAccountKey,
                  region: ruleVpcConfig.region,
                  vpcName: cidr.vpc,
                  organizationalUnitName: ruleResolvedVpcConfig?.ouKey,
                  subnetName,
                }),
              );
            }
            for (const subnetDefinition of cidrSubnet.definitions) {
              let cidrBlock: string = '';
              if (subnetDefinition.disabled) {
                continue;
              }
              if (['lookup', 'dynamic'].includes(ruleVpcConfig['cidr-src'])) {
                if (vpcAccountKey === accountKey && vpcConfig.name === cidr.vpc) {
                  cidrBlock = subnets.getAzSubnetForNameAndAz(subnetName, subnetDefinition.az)?.cidrBlock!;
                } else {
                  cidrBlock = ruleVpcSubnets.find(s => s.az === subnetDefinition.az)?.cidr!;
                }
              } else {
                cidrBlock = subnetDefinition.cidr?.value?.toCidrString()!;
              }
              if (!cidrBlock) {
                throw new Error(`Please Declare cidr using cidr block or use dynamic or lookup`);
              }
              const aclEntryProps: ec2.CfnNetworkAclEntryProps = {
                networkAclId: nacl.ref,
                protocol: rules.protocol,
                ruleAction: rules['rule-action'],
                ruleNumber,
                portRange,
                cidrBlock,
                egress: rules.egress,
              };
              new ec2.CfnNetworkAclEntry(
                this,
                `Nacl-Rule-${vpcConfig.name}-${subnetName}-${subnetDefinition.az}-${index + 1}`,
                aclEntryProps,
              );
              ruleNumber = ruleNumber + 200;
            }
          }
        }
      }
    }
  }
}
