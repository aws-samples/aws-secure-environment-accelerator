import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as config from '@aws-pbmm/common-lambda/lib/config';
import * as constructs from '@aws-pbmm/constructs/lib/vpc/vpc';
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
  vpcConfig: config.VpcConfig;
  accountKey: string;
  vpcId: string;
}

export class SecurityGroup extends cdk.Construct {
  readonly securityGroupNameMapping: NameToSecurityGroupMap = {};
  readonly securityGroups: constructs.SecurityGroup[] = [];

  constructor(parent: cdk.Construct, name: string, props: SecurityGroupProps) {
    super(parent, name);
    const { vpcConfig, accountKey, vpcId } = props;
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
      this.securityGroups.push({
        id: sg.ref,
        name: groupName,
      });
    }
    for (const securityGroup of securityGroups || []) {
      const inboundRules = securityGroup['inbound-rules'];
      const groupName = securityGroup.name;
      const outboundRules = securityGroup['outbound-rules'];
      if (inboundRules) {
        for (const [ruleId, rule] of inboundRules.entries()) {
          const ruleParams = this.prepareSecurityGroupRuleProps(groupName, rule, vpcConfig);
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
          const ruleParams = this.prepareSecurityGroupRuleProps(groupName, rule, vpcConfig);
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

  prepareSecurityGroupRuleProps = (
    groupName: string,
    rule: config.SecurityGroupRuleConfig,
    vpcConfig: config.VpcConfig,
  ): SecurityGroupruleProps[] => {
    const ruleProps: SecurityGroupruleProps[] = [];
    // TODO Support type, udp-ports or tcp-ports here
    if (!rule.type) {
      return [];
    }
    for (const ruleType of rule.type) {
      const ruleSources = rule.source;
      let ipProtocol;
      let toPort;
      let fromPort;
      const ruleDescription = rule.description;

      // Prepare Protocol and Port for rule params
      if (ruleType === 'ALL') {
        ipProtocol = ec2.Protocol.ALL;
      } else if (Object.keys(TCP_PROTOCOLS_PORT).includes(ruleType)) {
        ipProtocol = ec2.Protocol.TCP;
        toPort = TCP_PROTOCOLS_PORT[ruleType];
        fromPort = TCP_PROTOCOLS_PORT[ruleType];
      } else {
        ipProtocol = ruleType;
        toPort = rule.toPort;
        fromPort = rule.fromPort;
      }

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
          // Check for Subnet CIDR Security Group
          for (const ruleSubnet of ruleSource.subnet) {
            const vpcConfigSubnets = vpcConfig.subnets?.find(s => s.name === ruleSubnet);
            if (!vpcConfigSubnets) {
              console.log(`Invalid Subnet provided in Security Group config "${ruleSubnet}"`);
              continue;
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
    }
    return ruleProps;
  };
}
