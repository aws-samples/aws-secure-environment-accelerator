import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as config from '@aws-pbmm/common-lambda/lib/config';
import { Region } from '@aws-pbmm/common-lambda/lib/config/types';
import { pascalCase } from 'pascal-case';
import { Account } from '../utils/accounts';
import { FlowLog } from './flow-log';
import { InterfaceEndpoints } from './interface-endpoints';
import { VpcStack } from './vpc-stack';
import { TransitGateway } from './transit-gateway';
import { TransitGatewayAttachment } from './transit-gateway-attachment';
import { VpcSubnetSharing } from './vpc-subnet-sharing';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';

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
  toPort?: number;
  fromPort?: number;
  description?: string;
  sourceSecurityGroupId?: string;
  groupId: string;
}

export interface VpcCommonProps {
  /**
   * List of accounts in the organization.
   */
  accounts: Account[];
  /**
   * The VPC configuration for the VPC.
   */
  vpcConfig: config.VpcConfig;
  /**
   * Transit gateway deployment.
   */
  tgwDeployment?: config.DeploymentConfig;
  /**
   * The name of the organizational unit if this VPC is in an organizational unit account.
   */
  organizationalUnitName?: string;
  /**
   * Current VPC Creation account Key
   */
  accountKey?: string;
}

export interface AzSubnet {
  subnet: ec2.CfnSubnet;
  subnetName: string;
  az: string;
}

export interface NameToIdMap {
  [key: string]: string;
}

/**
 * Auxiliary class that makes management and lookup of subnets easier.
 */
export class AzSubnets {
  readonly subnets: AzSubnet[] = [];

  push(value: AzSubnet): this {
    this.subnets.push(value);
    return this;
  }

  getAzSubnetsForSubnetName(subnetName: string): AzSubnet[] {
    return this.subnets.filter(s => s.subnetName === subnetName);
  }

  getAzSubnetIdsForSubnetName(subnetName: string): string[] {
    return this.getAzSubnetsForSubnetName(subnetName).map(s => s.subnet.ref);
  }

  getAzSubnetForNameAndAz(subnetName: string, az: string): AzSubnet | undefined {
    return this.subnets.find(s => s.subnetName === subnetName && s.az === az);
  }

  getAzSubnetIdForNameAndAz(subnetName: string, az: string): string | undefined {
    return this.getAzSubnetForNameAndAz(subnetName, az)?.subnet?.ref;
  }
}

export interface VpcProps extends cdk.StackProps, VpcCommonProps {}

/**
 * This construct creates a VPC, NAT gateway, internet gateway, virtual private gateway, route tables, subnets,
 * gateway endpoints, interface endpoints and transit gateway. It also allows VPC flow logging and VPC sharing.
 *
 * The construct is quite large and could be broken down into several smaller constructs.
 *
 * TODO: Decouple this class from the configuration file.
 */
export class Vpc extends cdk.Construct {
  readonly name: string;
  readonly region: Region;

  readonly vpcId: string;
  readonly azSubnets = new AzSubnets();

  readonly securityGroupNameMapping: NameToIdMap = {};
  readonly routeTableNameToIdMap: NameToIdMap = {};

  constructor(stack: VpcStack, name: string, props: VpcProps) {
    super(stack, name);

    const { accounts, vpcConfig, organizationalUnitName } = props;
    const vpcName = props.vpcConfig.name;

    this.name = props.vpcConfig.name;
    this.region = vpcConfig.region;

    // Create Custom VPC using CFN construct as tags override option not available in default construct
    const vpcObj = new ec2.CfnVPC(this, vpcName, {
      cidrBlock: props.vpcConfig.cidr.toCidrString(),
    });
    this.vpcId = vpcObj.ref;

    let extendVpc;
    if (props.vpcConfig.cidr2) {
      extendVpc = new ec2.CfnVPCCidrBlock(this, `ExtendVPC`, {
        cidrBlock: props.vpcConfig.cidr2.toCidrString(),
        vpcId: vpcObj.ref,
      });
    }

    let igw;
    let igwAttach;
    if (props.vpcConfig.igw) {
      // Create IGW
      igw = new ec2.CfnInternetGateway(this, `${vpcName}_igw`);
      // Attach IGW to VPC
      igwAttach = new ec2.CfnVPCGatewayAttachment(this, `${props.vpcConfig.name}_attach_igw`, {
        vpcId: vpcObj.ref,
        internetGatewayId: igw.ref,
      });
    }

    let vgw;
    let vgwAttach;

    const vgwConfig = props.vpcConfig.vgw;
    if (vgwConfig) {
      const amazonSideAsn = config.VirtualPrivateGatewayConfig.is(vgwConfig) ? vgwConfig.asn : undefined;

      // Create VGW
      vgw = new ec2.CfnVPNGateway(this, `${props.vpcConfig.name}_vpg`, {
        type: 'ipsec.1',
        amazonSideAsn,
      });

      // Attach VGW to VPC
      vgwAttach = new ec2.CfnVPCGatewayAttachment(this, `${props.vpcConfig.name}_attach_vgw`, {
        vpcId: vpcObj.ref,
        vpnGatewayId: vgw.ref,
      });
    }

    const s3Routes: string[] = [];
    const dynamoRoutes: string[] = [];
    const routeTablesProps = props.vpcConfig['route-tables'];
    const natRouteTables: string[] = [];
    if (routeTablesProps) {
      // Create Route Tables
      for (const routeTableProp of routeTablesProps) {
        if (routeTableProp.name === 'default') {
          continue;
        }

        const routeTableName = routeTableProp.name;
        const routeTable = new ec2.CfnRouteTable(this, routeTableName, {
          vpcId: vpcObj.ref,
        });

        this.routeTableNameToIdMap[routeTableName] = routeTable.ref;
        if (!routeTableProp.routes?.find(r => r.target === 'IGW')) {
          natRouteTables.push(routeTableProp.name);
        }

        // Add Routes to RouteTable
        for (const route of routeTableProp.routes ? routeTableProp.routes : []) {
          let dependsOn: cdk.CfnResource | undefined;
          let gatewayId: string | undefined;
          if (route.target === 'IGW') {
            gatewayId = igw?.ref;
            dependsOn = igwAttach;
          } else if (route.target === 'VGW') {
            gatewayId = vgw?.ref;
            dependsOn = vgwAttach;
          } else if (route.target.toLowerCase() === 's3') {
            s3Routes.push(routeTable.ref);
            continue;
          } else if (route.target.toLowerCase() === 'dynamodb') {
            dynamoRoutes.push(routeTable.ref);
            continue;
          } else {
            // Need to add for different Routes
            continue;
          }

          const params: ec2.CfnRouteProps = {
            routeTableId: routeTable.ref,
            destinationCidrBlock: route.destination as string,
            gatewayId,
          };
          const cfnRoute = new ec2.CfnRoute(this, `${routeTableName}_${route.target}`, params);
          if (dependsOn) {
            cfnRoute.addDependsOn(dependsOn);
          }
        }
      }
    }

    const subnetsConfig = props.vpcConfig.subnets || [];
    for (const subnetConfig of subnetsConfig) {
      const subnetName = subnetConfig.name;
      for (const subnetDefinition of subnetConfig.definitions.values()) {
        if (subnetDefinition.disabled) {
          continue;
        }

        const subnetCidr = subnetDefinition.cidr?.toCidrString() || subnetDefinition.cidr2?.toCidrString();
        if (!subnetCidr) {
          throw new Error(
            `Subnet with name "${subnetName}" and AZ "${subnetDefinition.az}" does not have a CIDR block`,
          );
        }

        const subnetId = pascalCase(`${subnetName}-${subnetDefinition.az}`);
        const subnet = new ec2.CfnSubnet(this, `Subnet${subnetId}`, {
          cidrBlock: subnetCidr,
          vpcId: vpcObj.ref,
          availabilityZone: `${this.region}${subnetDefinition.az}`,
        });
        if (extendVpc) {
          subnet.addDependsOn(extendVpc);
        }
        this.azSubnets.push({
          subnet,
          subnetName,
          az: subnetDefinition.az,
        });

        // Attach Subnet to Route-Table
        const routeTableName = subnetDefinition['route-table'];
        if (routeTableName === 'default') {
          continue;
        }

        // Find the route table ID for the route table name
        const routeTableId = this.routeTableNameToIdMap[routeTableName];
        if (!routeTableId) {
          throw new Error(`Cannot find route table with name "${routeTableName}"`);
        }

        // Associate the route table with the subnet
        new ec2.CfnSubnetRouteTableAssociation(this, `RouteTable${subnetId}`, {
          routeTableId,
          subnetId: subnet.ref,
        });
      }
    }

    // Create VPC Gateway End Point
    const gatewayEndpoints = props.vpcConfig['gateway-endpoints'] || [];
    for (const gwEndpointName of gatewayEndpoints) {
      const gwService = new ec2.GatewayVpcEndpointAwsService(gwEndpointName.toLowerCase());
      new ec2.CfnVPCEndpoint(this, `Endpoint_${gwEndpointName}`, {
        serviceName: gwService.name,
        vpcId: vpcObj.ref,
        routeTableIds: gwEndpointName.toLocaleLowerCase() === 's3' ? s3Routes : dynamoRoutes,
      });
    }

    // Create NAT Gateway
    const natgwProps = vpcConfig.natgw;
    if (config.NatGatewayConfig.is(natgwProps)) {
      const subnetConfig = natgwProps.subnet;
      const subnetId = this.azSubnets.getAzSubnetIdForNameAndAz(subnetConfig.name, subnetConfig.az);
      if (!subnetId) {
        throw new Error(`Cannot find NAT gateway subnet name "${subnetConfig.name}" in AZ "${subnetConfig.az}"`);
      }

      const eip = new ec2.CfnEIP(this, 'EIP_shared-network');

      const natgw = new ec2.CfnNatGateway(this, `ntgw_${vpcName}`, {
        allocationId: eip.attrAllocationId,
        subnetId,
      });

      // Attach NatGw Routes to Non IGW Route Tables
      for (const natRoute of natRouteTables) {
        const routeTableId = this.routeTableNameToIdMap[natRoute];
        const routeParams: ec2.CfnRouteProps = {
          routeTableId,
          destinationCidrBlock: '0.0.0.0/0',
          natGatewayId: natgw?.ref,
        };
        new ec2.CfnRoute(this, `${natRoute}_natgw_route`, routeParams);
      }
    } else {
      console.log(`Skipping NAT gateway creation`);
    }

    // Creating TGW for Shared-Network Account
    const tgwDeployment = props.tgwDeployment;
    if (tgwDeployment) {
      const twgAttach = vpcConfig['tgw-attach'];
      const tgw = new TransitGateway(this, tgwDeployment.name!, tgwDeployment);
      if (twgAttach) {
        const attachConfig = vpcConfig['tgw-attach']!;

        const attachSubnetsConfig = attachConfig['attach-subnets'] || [];
        const associateConfig = attachConfig['tgw-rt-associate'] || [];
        const propagateConfig = attachConfig['tgw-rt-propagate'] || [];

        const subnetIds = attachSubnetsConfig.flatMap(
          subnet => this.azSubnets.getAzSubnetIdsForSubnetName(subnet) || [],
        );
        const tgwRouteAssociates = associateConfig.map(route => tgw.getRouteTableIdByName(route)!);
        const tgwRoutePropagates = propagateConfig.map(route => tgw.getRouteTableIdByName(route)!);

        // Attach VPC To TGW
        new TransitGatewayAttachment(this, 'TgwAttach', {
          vpcId: this.vpcId,
          subnetIds,
          transitGatewayId: tgw.tgwId,
          tgwRouteAssociates,
          tgwRoutePropagates,
        });
      }
    }

    const securityGroups = vpcConfig['security-groups'];
    if (securityGroups) {
      // Create all security groups
      for (const securityGroup of securityGroups) {
        const groupName = `${securityGroup.name}-${vpcConfig.name}-${props.accountKey}-sg`;
        const groupDescription = `${props.accountKey} ${vpcConfig.name} Mgmt Security Group`;
        const sg = new ec2.CfnSecurityGroup(this, `${groupName}`, {
          vpcId: this.vpcId,
          groupDescription,
          groupName,
        });
        this.securityGroupNameMapping[securityGroup.name] = sg.ref;
      }
      for (const securityGroup of securityGroups) {
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

    // Create interface endpoints
    const interfaceEndpointConfig = vpcConfig['interface-endpoints'];
    if (config.InterfaceEndpointConfig.is(interfaceEndpointConfig)) {
      new InterfaceEndpoints(this, 'InterfaceEndpoints', {
        vpc: this,
        subnetName: interfaceEndpointConfig.subnet,
        interfaceEndpoints: interfaceEndpointConfig.endpoints,
      });
    }

    // Create flow logs
    const flowLogs = vpcConfig['flow-logs'];
    if (flowLogs) {
      const flowLogBucket = stack.getOrCreateFlowLogBucket();

      new FlowLog(this, 'FlowLogs', {
        vpcId: this.vpcId,
        bucketArn: flowLogBucket.bucketArn,
      });
    }

    // Share VPC subnet
    new VpcSubnetSharing(this, 'Sharing', {
      accounts,
      vpcConfig,
      organizationalUnitName,
      subnets: this.azSubnets,
    });
  }

  prepareSecurityGroupRuleProps = (
    groupName: string,
    rule: config.SecurityGroupRuleConfig,
    vpcConfig: config.VpcConfig,
  ): SecurityGroupruleProps[] => {
    const ruleProps: SecurityGroupruleProps[] = [];
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
            groupId: this.securityGroupNameMapping[groupName],
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
              throw new Error(`Invalid Subnet provided inSecurity Group config "${ruleSubnet}"`);
            }
            for (const [index, subnet] of Object.entries(vpcConfigSubnets.definitions)) {
              if (subnet.disabled) {
                continue;
              }
              ruleProps.push({
                ipProtocol,
                groupId: this.securityGroupNameMapping[groupName],
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
              groupId: this.securityGroupNameMapping[groupName],
              description: ruleDescription,
              sourceSecurityGroupId: this.securityGroupNameMapping[ruleSg],
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
