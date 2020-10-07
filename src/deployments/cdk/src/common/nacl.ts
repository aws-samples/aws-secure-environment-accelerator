import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import * as config from '@aws-accelerator/common-config/src';
import { AzSubnets } from './vpc';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';

export interface NaclProps {
  accountKey: string;
  vpcConfig: config.VpcConfig;
  vpcId: string;
  subnetConfig: config.SubnetConfig;
  subnets: AzSubnets;
  vpcConfigs: config.ResolvedVpcConfig[];
}

export class Nacl extends cdk.Construct {
  constructor(parent: cdk.Construct, name: string, props: NaclProps) {
    super(parent, name);
    const { accountKey, vpcConfig, vpcId, subnetConfig, subnets, vpcConfigs } = props;
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
        if (NonEmptyString.is(cidr)) {
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
            for (const subnetDefinition of cidrSubnet.definitions) {
              if (subnetDefinition.disabled) {
                continue;
              }
              const cidrBlock = subnetDefinition.cidr
                ? subnetDefinition.cidr.toCidrString()
                : subnetDefinition.cidr2?.toCidrString();
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
