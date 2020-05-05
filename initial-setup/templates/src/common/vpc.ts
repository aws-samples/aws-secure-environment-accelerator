import * as cdk from '@aws-cdk/core';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as config from '@aws-pbmm/common-lambda/lib/config';
import { Region } from '@aws-pbmm/common-lambda/lib/config/types';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { pascalCase } from 'pascal-case';
import { VpcSubnetSharing } from './vpc-subnet-sharing';
import { TransitGatewayAttachment } from '../common/transit-gateway-attachment';
import { TransitGateway } from './transit-gateway';
import { Context } from '../utils/context';

export interface VpcCommonProps {
  /**
   * The context of the deployment.
   */
  context: Context;
  /**
   * Current VPC Creation account.
   */
  account: Account;
  /**
   * The VPC configuration for the VPC.
   */
  vpcConfig: config.VpcConfig;
  /**
   * Transit gateway deployment.
   */
  tgwDeployment?: config.TgwDeploymentConfig;
  /**
   * The name of the organizational unit if this VPC is in an organizational unit account.
   */
  organizationalUnitName?: string;
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

export interface VpcStackProps {
  vpcProps: VpcProps;
  transitGateways: Map<string, TransitGateway>;
}

export class VpcStack extends cfn.NestedStack {
  readonly vpc: Vpc;

  constructor(scope: cdk.Construct, name: string, props: VpcStackProps) {
    super(scope, name);

    // Create the VPC
    this.vpc = new Vpc(this, props.vpcProps.vpcConfig.name, props.vpcProps);

    const tgwDeployment = props.vpcProps.tgwDeployment;
    if (tgwDeployment) {
      const tgw = new TransitGateway(this, tgwDeployment.name!, tgwDeployment);
      props.transitGateways.set(tgwDeployment.name!, tgw);
    }

    const tgwAttach = props.vpcProps.vpcConfig['tgw-attach'];
    if (tgwAttach) {
      const tgwName = tgwAttach['associate-to-tgw'];
      const tgw = props.transitGateways.get(tgwName);
      if (tgw && tgwName.length > 0) {
        const attachSubnetsConfig = tgwAttach['attach-subnets'] || [];
        const associateConfig = tgwAttach['tgw-rt-associate'] || [];
        const propagateConfig = tgwAttach['tgw-rt-propagate'] || [];

        const subnetIds = attachSubnetsConfig.flatMap(
          subnet => this.vpc.azSubnets.getAzSubnetIdsForSubnetName(subnet) || [],
        );
        const tgwRouteAssociates = associateConfig.map(route => tgw.getRouteTableIdByName(route)!);
        const tgwRoutePropagates = propagateConfig.map(route => tgw.getRouteTableIdByName(route)!);

        // Attach VPC To TGW
        new TransitGatewayAttachment(this, 'TgwAttach', {
          vpcId: this.vpc.vpcId,
          subnetIds,
          transitGatewayId: tgw.tgwId,
          tgwRouteAssociates,
          tgwRoutePropagates,
        });
      }
    }
  }
}

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

  constructor(scope: cdk.Construct, name: string, props: VpcProps) {
    super(scope, name);

    const { context, account, vpcConfig, organizationalUnitName } = props;

    const vpcName = props.vpcConfig.name;
    const useCentralEndpointsConfig: boolean = props.vpcConfig['use-central-endpoints'] ?? false;

    this.name = props.vpcConfig.name;
    this.region = vpcConfig.region;

    // Create Custom VPC using CFN construct as tags override option not available in default construct
    const vpcObj = new ec2.CfnVPC(this, vpcName, {
      cidrBlock: props.vpcConfig.cidr.toCidrString(),
      enableDnsHostnames: useCentralEndpointsConfig,
      enableDnsSupport: useCentralEndpointsConfig,
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

    // Share VPC subnet
    new VpcSubnetSharing(this, 'Sharing', {
      context,
      account,
      vpcConfig,
      organizationalUnitName,
      subnets: this.azSubnets,
    });
  }
}
