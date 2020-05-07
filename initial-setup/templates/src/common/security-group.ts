import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import * as config from '@aws-pbmm/common-lambda/lib/config';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';

export interface NameToSecurityGroupMap {
  [key: string]: ec2.CfnSecurityGroup;
}

const TCP_PROTOCOLS_PORT: { [key: string]: number } = {
  RDP: 3389,
  SSH: 22,
  HTTP: 80,
  HTTPS: 443,
  'MS SQL': 1433,
  'MYSQL/AURORA': 3306,
  REDSHIFT: 5439,
  POSTGRESQL: 5432,
  'ORACLE-RDS': 1521,
};

export interface SecurityGroupruleProps {
  ipProtocol: string;
  cidrIp?: string;
  toPort?: number;
  fromPort?: number;
  description?: string;
  sourceSecurityGroupId?: string;
  groupId: string;
}

export interface SecurityGroupProps {
  /**
   * The VPC configuration for the VPC.
   */
  vpcConfig: config.VpcConfig;
  /**
   * Current VPC Creation account Key
   */
  accountKey: string;
  /**
   * VpcId which is created
   */
  vpcId: string;
  accountVpcConfigs: config.ResolvedVpcConfig[];
}

export class SecurityGroup extends cdk.Construct {
  readonly securityGroupNameMapping: NameToSecurityGroupMap = {};

  constructor(parent: cdk.Construct, name: string, props: SecurityGroupProps) {
    super(parent, name);
    const { vpcConfig, accountKey, vpcId, accountVpcConfigs } = props;
    const securityGroups = vpcConfig['security-groups'];
    // Create all security groups
    for (const securityGroup of securityGroups || []) {
      const groupName = securityGroup.name;
      const groupDescription = `${accountKey} ${vpcConfig.name} Mgmt Security Group`;
      const sg = new ec2.CfnSecurityGroup(this, `${groupName}`, {
        vpcId,
        groupDescription,
        groupName,
      });
      this.securityGroupNameMapping[securityGroup.name] = sg;
    }
    for (const securityGroup of securityGroups || []) {
      const inboundRules = securityGroup['inbound-rules'];
      const groupName = securityGroup.name;
      const outboundRules = securityGroup['outbound-rules'];
      if (inboundRules) {
        for (const [ruleId, rule] of inboundRules.entries()) {
          const ruleParams = this.prepareSecurityGroupRuleProps(groupName, rule, vpcConfig, accountVpcConfigs);
          if (ruleParams.length === 0) {
            continue;
          }
          for (const [index, params] of ruleParams.entries()) {
            new ec2.CfnSecurityGroupIngress(this, `${groupName}-Ingress-${ruleId}-${index}`, params);
          }
        }
      }
      if (outboundRules) {
        for (const [ruleId, rule] of outboundRules.entries()) {
          const ruleParams = this.prepareSecurityGroupRuleProps(groupName, rule, vpcConfig, accountVpcConfigs);
          if (ruleParams.length === 0) {
            continue;
          }
          for (const [index, params] of ruleParams.entries()) {
            new ec2.CfnSecurityGroupEgress(this, `${groupName}-Egress-${ruleId}-${index}`, params);
          }
        }
      }
    }
  }

  getRules = (
    groupName: string,
    ipProtocol: string,
    accountVpcConfigs: config.ResolvedVpcConfig[],
    rule: config.SecurityGroupRuleConfig,
    fromPort?: number,
    toPort?: number,
  ): SecurityGroupruleProps[] => {
    const ruleProps: SecurityGroupruleProps[] = [];
    const ruleSources = rule.source;
    const ruleDescription = rule.description;
    for (const ruleSource of ruleSources) {
      if (NonEmptyString.is(ruleSource)) {
        ruleProps.push({
          ipProtocol,
          groupId: this.securityGroupNameMapping[groupName].ref,
          description: rule.description,
          cidrIp: ruleSource,
          toPort,
          fromPort,
        });
      } else if (config.SecurityGroupRuleSubnetSourceConfig.is(ruleSource)) {
        const ruleVpcConfig = accountVpcConfigs.find(x => x.vpcConfig.name === ruleSource.vpc)?.vpcConfig;
        if (!ruleVpcConfig) {
          throw new Error(`VPC Not Found in Config "${ruleSource.vpc}"`);
        }
        // Check for Subnet CIDR Security Group
        for (const ruleSubnet of ruleSource.subnet) {
          const vpcConfigSubnets = ruleVpcConfig.subnets?.find(s => s.name === ruleSubnet);
          if (!vpcConfigSubnets) {
            throw new Error(`Invalid Subnet provided in Security Group config "${ruleSubnet}"`);
          }
          for (const [index, subnet] of Object.entries(vpcConfigSubnets.definitions)) {
            if (subnet.disabled) {
              continue;
            }
            ruleProps.push({
              ipProtocol,
              groupId: this.securityGroupNameMapping[groupName].ref,
              description: `${ruleDescription} from ${ruleSubnet}-${subnet.az}`,
              cidrIp: subnet.cidr ? subnet.cidr.toCidrString() : subnet.cidr2?.toCidrString(),
              toPort,
              fromPort,
            });
          } // Looping Through Subnet Definitions
        } // Looging Through subnets
      } else if (config.SecurityGroupRuleSecurityGroupSourceConfig.is(ruleSource)) {
        // Check for Security Group reference to Security Group
        for (const ruleSg of ruleSource['security-group']) {
          ruleProps.push({
            ipProtocol,
            groupId: this.securityGroupNameMapping[groupName].ref,
            description: ruleDescription,
            sourceSecurityGroupId: this.securityGroupNameMapping[ruleSg].ref,
            toPort,
            fromPort,
          });
        }
      }
    }
    return ruleProps;
  };

  prepareSecurityGroupRuleProps = (
    groupName: string,
    rule: config.SecurityGroupRuleConfig,
    vpcConfig: config.VpcConfig,
    accountVpcConfigs: config.ResolvedVpcConfig[],
  ): SecurityGroupruleProps[] => {
    let ruleProps: SecurityGroupruleProps[] = [];
    if (!rule.type) {
      // Handling tcp-ports and udp-ports
      const tcpPorts = rule['tcp-ports'];
      const udpPorts = rule['udp-ports'];
      for (const port of tcpPorts || []) {
        const ipProtocol = ec2.Protocol.TCP;
        const toPort = port;
        const fromPort = port;
        ruleProps = ruleProps.concat(this.getRules(groupName, ipProtocol, accountVpcConfigs, rule, toPort, fromPort));
      }
      for (const port of udpPorts || []) {
        const ipProtocol = ec2.Protocol.TCP;
        const toPort = port;
        const fromPort = port;
        ruleProps = ruleProps.concat(this.getRules(groupName, ipProtocol, accountVpcConfigs, rule, toPort, fromPort));
      }
      return ruleProps;
    }

    // Handling rule Types including ALL/TCP/UDP and any custom Rule with from and to ports
    for (const ruleType of rule.type) {
      let ipProtocol;
      let toPort: number;
      let fromPort: number;

      // Prepare Protocol and Port for rule params
      if (ruleType === 'ALL') {
        ipProtocol = ec2.Protocol.ALL;
        ruleProps = ruleProps.concat(this.getRules(groupName, ipProtocol, accountVpcConfigs, rule));
      } else if (Object.keys(TCP_PROTOCOLS_PORT).includes(ruleType)) {
        ipProtocol = ec2.Protocol.TCP;
        toPort = TCP_PROTOCOLS_PORT[ruleType];
        fromPort = TCP_PROTOCOLS_PORT[ruleType];
        ruleProps = ruleProps.concat(this.getRules(groupName, ipProtocol, accountVpcConfigs, rule, toPort, fromPort));
      } else {
        ipProtocol = ruleType;
        toPort = rule.toPort!;
        fromPort = rule.fromPort!;
        ruleProps = ruleProps.concat(this.getRules(groupName, ipProtocol, accountVpcConfigs, rule, toPort, fromPort));
      }
    }
    return ruleProps;
  };
}
