import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as config from '@aws-pbmm/common-lambda/lib/config';
import { Region } from '@aws-pbmm/common-lambda/lib/config/types';
import * as constructs from '@aws-pbmm/constructs/lib/vpc';
import { Account } from '../utils/accounts';
import { VpcSubnetSharing } from './vpc-subnet-sharing';
import { Nacl } from './nacl';
import { Limiter } from '../utils/limits';
import { TransitGatewayAttachment } from '../common/transit-gateway-attachment';
import { TransitGateway } from './transit-gateway';
import { NestedStack, NestedStackProps } from '@aws-cdk/aws-cloudformation';
import { SecurityGroup } from './security-group';

export interface VpcCommonProps {
  /**
   * Current VPC Creation account Key
   */
  accountKey: string;
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
  tgwDeployment?: config.TgwDeploymentConfig;
  /**
   * The name of the organizational unit if this VPC is in an organizational unit account.
   */
  organizationalUnitName?: string;
  limiter: Limiter;
  /**
   * All VPC Configs to read Subnet Cidrs for Security Group and NACLs creation
   */
  vpcConfigs?: config.ResolvedVpcConfig[];
}

export interface AzSubnet extends constructs.Subnet {
  subnet: ec2.CfnSubnet;
  subnetName: string;
  az: string;
  cidrBlock: string;
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

export interface VpcStackProps extends NestedStackProps {
  vpcProps: VpcProps;
  transitGateways: Map<string, TransitGateway>;
}

export class VpcStack extends NestedStack {
  readonly vpc: Vpc;

  constructor(scope: cdk.Construct, name: string, props: VpcStackProps) {
    super(scope, name, props);

    // Create TGW Before Creating VPC
    let tgw;
    const tgwDeployment = props.vpcProps.tgwDeployment;
    if (tgwDeployment) {
      tgw = new TransitGateway(this, tgwDeployment.name, tgwDeployment);
      props.transitGateways.set(tgwDeployment.name, tgw);
    }

    // Create the VPC
    this.vpc = new Vpc(this, props.vpcProps.vpcConfig.name, props);
    if (tgw) {
      this.vpc.node.addDependency(tgw);
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
export class Vpc extends cdk.Construct implements constructs.Vpc {
  readonly name: string;
  readonly region: Region;

  readonly vpcId: string;
  readonly azSubnets = new AzSubnets();

  readonly cidrBlock: string;
  readonly additionalCidrBlocks: string[] = [];

  readonly securityGroup?: SecurityGroup;
  readonly routeTableNameToIdMap: NameToIdMap = {};

  constructor(scope: cdk.Construct, name: string, props: VpcStackProps) {
    super(scope, name);

    const { accountKey, accounts, vpcConfig, organizationalUnitName, limiter, vpcConfigs } = props.vpcProps;
    const vpcName = props.vpcProps.vpcConfig.name;

    this.name = props.vpcProps.vpcConfig.name;
    this.region = vpcConfig.region;
    this.cidrBlock = vpcConfig.cidr.toCidrString();

    // Create Custom VPC using CFN construct as tags override option not available in default construct
    const vpcObj = new ec2.CfnVPC(this, vpcName, {
      cidrBlock: props.vpcProps.vpcConfig.cidr.toCidrString(),
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });
    this.vpcId = vpcObj.ref;

    let extendVpc;
    if (props.vpcProps.vpcConfig.cidr2) {
      extendVpc = new ec2.CfnVPCCidrBlock(this, `ExtendVPC`, {
        cidrBlock: props.vpcProps.vpcConfig.cidr2.toCidrString(),
        vpcId: vpcObj.ref,
      });
      this.additionalCidrBlocks.push(props.vpcProps.vpcConfig.cidr2.toCidrString());
    }

    let igw;
    let igwAttach;
    if (props.vpcProps.vpcConfig.igw) {
      // Create IGW
      igw = new ec2.CfnInternetGateway(this, `${vpcName}_igw`);
      // Attach IGW to VPC
      igwAttach = new ec2.CfnVPCGatewayAttachment(this, `${props.vpcProps.vpcConfig.name}_attach_igw`, {
        vpcId: vpcObj.ref,
        internetGatewayId: igw.ref,
      });
    }

    let vgw;
    let vgwAttach;

    const vgwConfig = props.vpcProps.vpcConfig.vgw;
    if (vgwConfig) {
      const amazonSideAsn = config.VirtualPrivateGatewayConfig.is(vgwConfig) ? vgwConfig.asn : undefined;

      // Create VGW
      vgw = new ec2.CfnVPNGateway(this, `${props.vpcProps.vpcConfig.name}_vpg`, {
        type: 'ipsec.1',
        amazonSideAsn,
      });

      // Attach VGW to VPC
      vgwAttach = new ec2.CfnVPCGatewayAttachment(this, `${props.vpcProps.vpcConfig.name}_attach_vgw`, {
        vpcId: vpcObj.ref,
        vpnGatewayId: vgw.ref,
      });
    }

    const s3Routes: string[] = [];
    const dynamoRoutes: string[] = [];
    const routeTablesProps = props.vpcProps.vpcConfig['route-tables'];
    const tgwAttach = props.vpcProps.vpcConfig['tgw-attach'];
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
      }
    }

    const subnetsConfig = props.vpcProps.vpcConfig.subnets || [];
    for (const subnetConfig of subnetsConfig) {
      const subnetName = subnetConfig.name;
      for (const subnetDefinition of subnetConfig.definitions.values()) {
        if (subnetDefinition.disabled) {
          continue;
        }

        const subnetCidr = subnetDefinition.cidr?.toCidrString() || subnetDefinition.cidr2?.toCidrString();
        if (!subnetCidr) {
          console.warn(`Subnet with name "${subnetName}" and AZ "${subnetDefinition.az}" does not have a CIDR block`);
          continue;
        }

        const subnetId = `${subnetName}_${vpcName}_az${subnetDefinition.az}`;
        const subnet = new ec2.CfnSubnet(this, subnetId, {
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
          id: subnet.ref,
          name: subnetName,
          az: subnetDefinition.az,
          cidrBlock: subnetCidr,
        });

        // Attach Subnet to Route-Table
        const routeTableName = subnetDefinition['route-table'];
        if (routeTableName === 'default') {
          continue;
        }

        // Find the route table ID for the route table name
        const routeTableId = this.routeTableNameToIdMap[routeTableName];
        if (!routeTableId) {
          console.warn(`Cannot find route table with name "${routeTableName}"`);
          continue;
        }

        // Associate the route table with the subnet
        new ec2.CfnSubnetRouteTableAssociation(this, `RouteTable${subnetId}`, {
          routeTableId,
          subnetId: subnet.ref,
        });
      }

      // Check for NACL's
      if (subnetConfig.nacls) {
        console.log(`NACL's Defined in VPC "${vpcName}" in Subnet "${subnetName}"`);
        new Nacl(this, `NACL-${subnetName}`, {
          accountKey,
          subnetConfig,
          vpcConfig,
          vpcId: this.vpcId,
          subnets: this.azSubnets,
          vpcConfigs: vpcConfigs!,
        });
      }
    }

    let tgwAttachment;
    if (config.TransitGatewayAttachConfigType.is(tgwAttach)) {
      const tgwName = tgwAttach['associate-to-tgw'];
      const tgw = props.transitGateways.get(tgwName);
      if (!tgw) {
        console.warn(`Cannot find transit gateway with name "${tgwName}"`);
      } else {
        const attachSubnetsConfig = tgwAttach['attach-subnets'] || [];
        const associateConfig = tgwAttach['tgw-rt-associate'] || [];
        const propagateConfig = tgwAttach['tgw-rt-propagate'] || [];

        const subnetIds = attachSubnetsConfig.flatMap(
          subnet => this.azSubnets.getAzSubnetIdsForSubnetName(subnet) || [],
        );

        const tgwRouteAssociates = associateConfig.map(route => tgw.getRouteTableIdByName(route)!);
        const tgwRoutePropagates = propagateConfig.map(route => tgw.getRouteTableIdByName(route)!);

        // Attach VPC To TGW
        tgwAttachment = new TransitGatewayAttachment(this, 'TgwAttach', {
          vpcId: this.vpcId,
          subnetIds,
          transitGatewayId: tgw.tgwId,
          tgwRouteAssociates,
          tgwRoutePropagates,
        });
        // Add name tag
        cdk.Tag.add(tgwAttachment, 'Name', `${vpcName}_${tgwName}_att`);
      }
    }

    // Add Routes to Route Tables
    if (routeTablesProps) {
      for (const routeTableProp of routeTablesProps) {
        if (routeTableProp.name === 'default') {
          continue;
        }
        const routeTableName = routeTableProp.name;
        const routeTableObj = this.routeTableNameToIdMap[routeTableName];
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
            s3Routes.push(routeTableObj);
            continue;
          } else if (route.target.toLowerCase() === 'dynamodb') {
            dynamoRoutes.push(routeTableObj);
            continue;
          } else if (route.target === 'TGW' && config.TransitGatewayAttachConfigType.is(tgwAttach) && tgwAttachment) {
            const tgwName = tgwAttach['associate-to-tgw'];
            const tgw = props.transitGateways.get(tgwName);
            dependsOn = tgw?.tgw;
            const tgwRoute = new ec2.CfnRoute(this, `${routeTableName}_${route.target}`, {
              routeTableId: routeTableObj,
              destinationCidrBlock: route.destination as string,
              transitGatewayId: tgw?.tgwId,
            });
            tgwRoute.addDependsOn(tgwAttachment.tgwAttach);
            continue;
          } else {
            // Need to add for different Routes
            continue;
          }

          const params: ec2.CfnRouteProps = {
            routeTableId: routeTableObj,
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

    // Create VPC Gateway End Point
    const gatewayEndpoints = props.vpcProps.vpcConfig['gateway-endpoints'] || [];
    for (const gwEndpointName of gatewayEndpoints) {
      const gwService = new ec2.GatewayVpcEndpointAwsService(gwEndpointName.toLowerCase());
      new ec2.CfnVPCEndpoint(this, `Endpoint_${gwEndpointName}`, {
        serviceName: gwService.name,
        vpcId: vpcObj.ref,
        routeTableIds: gwEndpointName.toLocaleLowerCase() === 's3' ? s3Routes : dynamoRoutes,
      });
    }

    const routeExistsForNatGW = (az: string | undefined, routeTable?: string): boolean => {
      // Returns True/False based on routes attachement to NATGW
      let routeExists = false;
      for (const natRoute of routeTable ? [routeTable] : natRouteTables) {
        const natRouteTableSubnetDef = allSubnetDefinitions.find(subnetDef => subnetDef['route-table'] === natRoute);
        if (az && natRouteTableSubnetDef?.az === az) {
          routeExists = true;
          break;
        } else if (!az && natRouteTableSubnetDef) {
          routeExists = true;
          break;
        }
      }
      return routeExists;
    };

    // Create NAT Gateway
    const allSubnetDefinitions = subnetsConfig.flatMap(s => s.definitions);
    const natgwProps = vpcConfig.natgw;
    if (config.NatGatewayConfig.is(natgwProps)) {
      const subnetConfig = natgwProps.subnet;
      const natSubnets: AzSubnet[] = [];
      if (subnetConfig.az) {
        natSubnets.push(this.azSubnets.getAzSubnetForNameAndAz(subnetConfig.name, subnetConfig.az)!);
      } else {
        natSubnets.push(...this.azSubnets.getAzSubnetsForSubnetName(subnetConfig.name));
      }
      for (const natSubnet of natSubnets) {
        if (!routeExistsForNatGW(natSubnet.az)) {
          // Skipping Creation of NATGW
          console.log(
            `Skipping Creation of NAT Gateway "${natSubnet.name}-${natSubnet.az}", as there is no routes associated to it`,
          );
          continue;
        }
        console.log(`Creating natgw for Subnet "${natSubnet.name}" az: "${natSubnet.az}"`);
        const natGWName = `NATGW_${natSubnet.name}_${natSubnet.az}_natgw`;
        const eip = new ec2.CfnEIP(this, `EIP_natgw_${natSubnet.az}`);

        const natgw = new ec2.CfnNatGateway(this, natGWName, {
          allocationId: eip.attrAllocationId,
          subnetId: natSubnet.id,
        });

        // Attach NatGw Routes to Non IGW Route Tables
        for (const natRoute of natRouteTables) {
          const routeTableId = this.routeTableNameToIdMap[natRoute];
          if (!routeExistsForNatGW(subnetConfig.az ? undefined : natSubnet.az, natRoute)) {
            // Skipping Route Association of NATGW if no route specified in subnet config
            console.log(
              `Skipping NAT Gateway Route association to Route Table "${natRoute}", as there is no subnet is mapped to it`,
            );
            continue;
          }
          const routeParams: ec2.CfnRouteProps = {
            routeTableId,
            destinationCidrBlock: '0.0.0.0/0',
            natGatewayId: natgw.ref,
          };
          new ec2.CfnRoute(this, `${natRoute}_natgw_route`, routeParams);
        }
      }
    }

    // Create all security groups
    if (vpcConfig['security-groups']) {
      this.securityGroup = new SecurityGroup(this, `SecurityGroups-${vpcConfig.name}`, {
        securityGroups: vpcConfig['security-groups'],
        vpcName: vpcConfig.name,
        vpcId: this.vpcId,
        accountKey,
        vpcConfigs: vpcConfigs!,
      });
    }

    // Share VPC subnet
    new VpcSubnetSharing(this, 'Sharing', {
      accountKey,
      accounts,
      vpcConfig,
      organizationalUnitName,
      subnets: this.azSubnets,
      limiter,
      vpc: vpcObj,
    });
  }

  get id(): string {
    return this.vpcId;
  }

  get subnets(): constructs.Subnet[] {
    return this.azSubnets.subnets;
  }

  get securityGroups(): constructs.SecurityGroup[] {
    return this.securityGroup?.securityGroups || [];
  }

  findSubnetByNameAndAvailabilityZone(name: string, az: string): constructs.Subnet {
    const subnet = this.tryFindSubnetByNameAndAvailabilityZone(name, az);
    if (!subnet) {
      throw new Error(`Cannot find subnet with name "${name}" in availability zone "${az}"`);
    }
    return subnet;
  }

  tryFindSubnetByNameAndAvailabilityZone(name: string, az: string): constructs.Subnet | undefined {
    return this.subnets.find(s => s.name === name && s.az === az);
  }

  findSubnetIdsByName(name: string): string[] {
    const subnets = this.tryFindSubnetIdsByName(name);
    if (subnets.length === 0) {
      throw new Error(`Cannot find subnet with name "${name}"`);
    }
    return subnets;
  }

  tryFindSubnetIdsByName(name: string): string[] {
    return this.subnets.filter(s => s.name === name).map(s => s.id);
  }

  findSecurityGroupByName(name: string): constructs.SecurityGroup {
    const securityGroup = this.tryFindSecurityGroupByName(name);
    if (!securityGroup) {
      throw new Error(`Cannot find security group with name "${name}"`);
    }
    return securityGroup;
  }

  tryFindSecurityGroupByName(name: string): constructs.SecurityGroup | undefined {
    return this.securityGroups.find(sg => sg.name === name);
  }

  findRouteTableByName(name: string): string {
    const routeTable = this.tryFindRouteTableByName(name);
    if (!routeTable) {
      throw new Error(`Cannot find route table with name "${name}"`);
    }
    return routeTable;
  }

  tryFindRouteTableByName(name: string): string | undefined {
    return this.routeTableNameToIdMap[name];
  }
}
