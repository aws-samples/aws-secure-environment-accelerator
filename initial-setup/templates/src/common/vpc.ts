import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import { VpcConfig, VirtualPrivateGatewayConfig, VpcConfigType } from '@aws-pbmm/common-lambda/lib/config';

function getRegionAz(region: string, az: string): string {
  return region.split('-')[region.split('-').length - 1] + az;
}

interface VGWProps {
  type: string;
  amazonSideAsn?: number;
}

export class Vpc extends cdk.Construct {
  readonly vpcId: string;
  readonly azSubnets = new Map<string, string[]>();
  readonly subnets = new Map<string, string>();
  readonly routeTableNameToIdMap = new Map<string, string>();

  constructor(parent: cdk.Construct, name: string, props: VpcConfig) {
    super(parent, name);
    const vpcName = props.name;
    // Create Custom VPC using CFN construct as tags override option not available in default construct
    const vpcObj = new ec2.CfnVPC(this, vpcName, {
      cidrBlock: props.cidr!!.toCidrString(),
    });

    let extendVpc;
    if (props.cidr2) {
      extendVpc = new ec2.CfnVPCCidrBlock(this, `ExtendVPC`, {
        cidrBlock: props.cidr2.toCidrString(),
        vpcId: vpcObj.ref,
      });
    }

    let igw;
    let igwAttach;
    if (props.igw) {
      // Create IGW
      igw = new ec2.CfnInternetGateway(this, `${vpcName}_igw`);
      // Attach IGW to VPC
      igwAttach = new ec2.CfnVPCGatewayAttachment(this, `${props.name}_attach_igw`, {
        vpcId: vpcObj.ref,
        internetGatewayId: igw.ref,
      });
    }

    let vgw;
    let vgwAttach;
    if (props.vgw) {
      const vgwConfig = props.vgw;
      const vgwProps: VGWProps = {
        type: 'ipsec.1',
      };
      // @ts-ignore
      if (VirtualPrivateGatewayConfig.is(vgwConfig) && vgwConfig.asn) {
        // @ts-ignore
        vgwProps.amazonSideAsn = vgwConfig.asn;
      }
      // Create VGW
      vgw = new ec2.CfnVPNGateway(this, `${props.name}_vpg`, vgwProps);
      // Attach VGW to VPC
      vgwAttach = new ec2.CfnVPCGatewayAttachment(this, `${props.name}_attach_vgw`, {
        vpcId: vpcObj.ref,
        vpnGatewayId: vgw.ref,
      });
    }

    const s3Routes: string[] = [];
    const dynamoRoutes: string[] = [];

    const routeTablesProps = props['route-tables'];
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
        this.routeTableNameToIdMap.set(routeTableName, routeTable.ref);
        if (!routeTableProp.routes?.find((r) => r.target === 'IGW')) {
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

    const subnetsConfig = props.subnets || [];
    for (const subnetConfig of subnetsConfig) {
      const subnetAzs: string[] = [];
      const propSubnetName = subnetConfig.name;
      for (const [key, subnetDefinition] of subnetConfig.definitions.entries()) {
        if (subnetDefinition.disabled) {
          continue;
        }

        // TODO Move this splitting stuff to a function so we can test it
        const az = getRegionAz(props.region!!, subnetDefinition.az);

        const subnetName = `${vpcName}_${propSubnetName}_az${key + 1}`;
        const subnet = new ec2.CfnSubnet(this, subnetName, {
          cidrBlock: subnetDefinition.cidr?.toCidrString() || subnetDefinition.cidr2?.toCidrString() || '',
          vpcId: vpcObj.ref,
          availabilityZone: `${props.region}${subnetDefinition.az}`,
        });
        if (extendVpc) {
          subnet.addDependsOn(extendVpc);
        }
        this.subnets.set(`${propSubnetName}_az${key + 1}`, subnet.ref);
        subnetAzs.push(subnet.ref);

        // Attach Subnet to Route-Table
        const routeTableName = subnetDefinition['route-table'];
        if (routeTableName === 'default') {
          continue;
        }

        // Find the route table ID for the route table name
        const routeTableId = this.routeTableNameToIdMap.get(routeTableName);
        if (!routeTableId) {
          throw new Error(`Cannot find route table with name "${routeTableName}"`);
        }

        // Associate the route table with the subnet
        new ec2.CfnSubnetRouteTableAssociation(this, `${subnetName}_ ${routeTableName}`, {
          routeTableId,
          subnetId: subnet.ref,
        });
      }
      this.azSubnets.set(propSubnetName, subnetAzs);
    }

    // Create VPC Gateway End Point
    for (const gwEndpointName of props['gateway-endpoints'] ? props['gateway-endpoints'] : []) {
      const gwService = new ec2.GatewayVpcEndpointAwsService(gwEndpointName.toLowerCase());
      new ec2.CfnVPCEndpoint(this, `Endpoint_${gwEndpointName}`, {
        serviceName: gwService.name,
        vpcId: vpcObj.ref,
        routeTableIds: gwEndpointName.toLocaleLowerCase() === 's3' ? s3Routes : dynamoRoutes,
      });
    }

    let natgw;
    // Create NAT Gateway
    if (props.natgw) {
      const natgwProps = props.natgw;
      const eip = new ec2.CfnEIP(this, 'EIP_shared-network');

      natgw = new ec2.CfnNatGateway(this, `ntgw_${vpcName}`, {
        allocationId: eip.attrAllocationId,
        // @ts-ignore
        subnetId: this.subnets.get(natgwProps.subnet),
      });

      // Attach NatGw Routes to Non IGW Route Tables
      for (const natRoute of natRouteTables) {
        const routeTableId = this.routeTableNameToIdMap.get(natRoute);
        const routeParams: ec2.CfnRouteProps = {
          routeTableId: routeTableId!!,
          destinationCidrBlock: '0.0.0.0/0',
          natGatewayId: natgw?.ref,
        };
        const cfnRoute = new ec2.CfnRoute(this, `${natRoute}_natgw_route`, routeParams);
      }
    }
    this.vpcId = vpcObj.ref;
  }
}
