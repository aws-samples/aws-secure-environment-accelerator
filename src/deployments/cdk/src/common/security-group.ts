import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as config from '@aws-accelerator/common-config/src';
import * as constructs from '@aws-accelerator/cdk-constructs/src/vpc';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';
import * as sv from 'semver';

export interface NameToSecurityGroupMap {
  [key: string]: ec2.CfnSecurityGroup;
}

const TCP_PROTOCOLS_PORT: { [key: string]: number } = {
  RDP: 3389,
  SSH: 22,
  HTTP: 80,
  HTTPS: 443,
  MSSQL: 1433,
  'MYSQL/AURORA': 3306,
  REDSHIFT: 5439,
  POSTGRESQL: 5432,
  'ORACLE-RDS': 1521,
};

export interface SecurityGroupruleProps {
  ipProtocol: string;
  cidrIp?: string;
  cidrIpv6?: string;
  toPort?: number;
  fromPort?: number;
  description?: string;
  sourceSecurityGroupId?: string;
  groupId: string;
}

export interface SecurityGroupProps {
  /**
   * Security Group configuration for the VPC.
   */
  securityGroups: config.SecurityGroupConfig[];
  /**
   * Current VPC Creation account Key
   */
  accountKey: string;
  /**
   * VpcId which is created
   */
  vpcId: string;
  /**
   * Vpc Name for which These Security Groups to be created
   */
  vpcName: string;

  installerVersion: string;

  vpcConfigs?: config.ResolvedVpcConfig[];

  sharedAccountKey?: string;
}

export class SecurityGroup extends cdk.Construct {
  readonly securityGroupNameMapping: NameToSecurityGroupMap = {};
  readonly securityGroups: constructs.SecurityGroup[] = [];

  constructor(parent: cdk.Construct, name: string, props: SecurityGroupProps) {
    super(parent, name);
    const { securityGroups, accountKey, vpcId, vpcConfigs, vpcName, installerVersion, sharedAccountKey } = props;

    const cleanVersion = sv.clean(installerVersion, { loose: true });
    let isUpdateDescription = false;
    const newSgDescriptionVersion = '1.2.2';
    if (cleanVersion) {
      // Checking only "major, minor, patch" versions. Ignoring characters appended to release tag
      if (sv.coerce(installerVersion)) {
        isUpdateDescription = sv.gte(sv.coerce(installerVersion)?.raw!, newSgDescriptionVersion);
      } else {
        isUpdateDescription = sv.gte(installerVersion, newSgDescriptionVersion);
      }
    } else {
      isUpdateDescription = sv.satisfies(newSgDescriptionVersion, installerVersion);
    }

    // const securityGroups = vpcConfig['security-groups'];
    // Create all security groups
    for (const securityGroup of securityGroups || []) {
      const groupName = `${securityGroup.name}_sg`;
      const groupDescription = isUpdateDescription
        ? `${sharedAccountKey || accountKey} ${vpcName} Security Group`
        : `${accountKey} ${vpcName} Mgmt Security Group`;
      const sg = new ec2.CfnSecurityGroup(this, securityGroup.name, {
        vpcId,
        groupDescription,
        groupName,
      });
      this.securityGroupNameMapping[securityGroup.name] = sg;
      this.securityGroups.push({
        id: sg.ref,
        name: securityGroup.name,
      });
    }
    for (const securityGroup of securityGroups || []) {
      const inboundRules = securityGroup['inbound-rules'];
      const groupName = securityGroup.name;
      const outboundRules = securityGroup['outbound-rules'];
      if (inboundRules) {
        for (const [ruleId, rule] of inboundRules.entries()) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          const ruleParams = this.prepareSecurityGroupRuleProps(accountKey, groupName, rule, vpcConfigs!);
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
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          const ruleParams = this.prepareSecurityGroupRuleProps(accountKey, groupName, rule, vpcConfigs!);
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
    accountKey: string,
    groupName: string,
    ipProtocol: string,
    rule: config.SecurityGroupRuleConfig,
    accountVpcConfigs?: config.ResolvedVpcConfig[],
    fromPort?: number,
    toPort?: number,
  ): SecurityGroupruleProps[] => {
    const ruleProps: SecurityGroupruleProps[] = [];
    const ruleSources = rule.source;
    const ruleDescription = rule.description;
    for (const ruleSource of ruleSources) {
      if (NonEmptyString.is(ruleSource)) {
        let ruleProp;
        if (ruleSource.includes('::')) {
          ruleProp = {
            ipProtocol,
            groupId: this.securityGroupNameMapping[groupName].ref,
            description: rule.description,
            cidrIpv6: ruleSource,
            toPort,
            fromPort,
          };
        } else {
          ruleProp = {
            ipProtocol,
            groupId: this.securityGroupNameMapping[groupName].ref,
            description: rule.description,
            cidrIp: ruleSource,
            toPort,
            fromPort,
          };
        }
        ruleProps.push(ruleProp);
      } else if (config.SecurityGroupRuleSubnetSourceConfig.is(ruleSource)) {
        const vpcAccountKey = ruleSource.account ? ruleSource.account : accountKey;
        const ruleVpcConfig = accountVpcConfigs?.find(
          x => x.vpcConfig.name === ruleSource.vpc && x.accountKey === vpcAccountKey,
        )?.vpcConfig;
        if (!ruleVpcConfig) {
          console.warn(`VPC Not Found in Config "${ruleSource.vpc}"`);
          continue;
        }
        // Check for Subnet CIDR Security Group
        for (const ruleSubnet of ruleSource.subnet) {
          const vpcConfigSubnets = ruleVpcConfig.subnets?.find(s => s.name === ruleSubnet);
          if (!vpcConfigSubnets) {
            console.warn(`Invalid Subnet provided in Security Group config "${ruleSubnet}"`);
            continue;
          }
          for (const [index, subnet] of Object.entries(vpcConfigSubnets.definitions)) {
            if (subnet.disabled || !subnet.cidr) {
              continue;
            }
            ruleProps.push({
              ipProtocol,
              groupId: this.securityGroupNameMapping[groupName].ref,
              description: `${ruleDescription} from ${ruleSubnet}-${subnet.az}`,
              cidrIp: subnet.cidr.toCidrString(),
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
    accountKey: string,
    groupName: string,
    rule: config.SecurityGroupRuleConfig,
    vpcConfigs?: config.ResolvedVpcConfig[],
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
        ruleProps = ruleProps.concat(
          this.getRules(accountKey, groupName, ipProtocol, rule, vpcConfigs, fromPort, toPort),
        );
      }
      for (const port of udpPorts || []) {
        const ipProtocol = ec2.Protocol.UDP;
        const toPort = port;
        const fromPort = port;
        ruleProps = ruleProps.concat(
          this.getRules(accountKey, groupName, ipProtocol, rule, vpcConfigs, fromPort, toPort),
        );
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
        ruleProps = ruleProps.concat(this.getRules(accountKey, groupName, ipProtocol, rule, vpcConfigs));
      } else if (Object.keys(TCP_PROTOCOLS_PORT).includes(ruleType)) {
        ipProtocol = ec2.Protocol.TCP;
        toPort = TCP_PROTOCOLS_PORT[ruleType];
        fromPort = TCP_PROTOCOLS_PORT[ruleType];
        ruleProps = ruleProps.concat(
          this.getRules(accountKey, groupName, ipProtocol, rule, vpcConfigs, fromPort, toPort),
        );
      } else {
        ipProtocol = ruleType;
        toPort = rule.toPort!;
        fromPort = rule.fromPort!;
        ruleProps = ruleProps.concat(
          this.getRules(accountKey, groupName, ipProtocol, rule, vpcConfigs, fromPort, toPort),
        );
      }
    }
    return ruleProps;
  };
}
