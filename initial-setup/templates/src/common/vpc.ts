import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import { VpcConfig } from '@aws-pbmm/common-lambda/lib/config';

export class Vpc extends cdk.Construct {
  readonly vpcId: string;
  readonly subnets = new Map<string, string[]>();

  constructor(parent: cdk.Construct, name: string, props: VpcConfig) {
    super(parent, name);
    const vpcName = props.name;
    // Create Custom VPC using CFN construct as tags override option not available in default construct
    const vpcObj = new ec2.CfnVPC(this, vpcName, {
      cidrBlock: props.cidr!!.toCidrString(),
    });

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
      // Create VGW
      vgw = new ec2.CfnVPNGateway(this, `${props.name}_vgw`, {
        type: 'ipsec.1',
      });
      // Attach VGW to VPC
      vgwAttach = new ec2.CfnVPCGatewayAttachment(this, `${props.name}_attach_vgw`, {
        vpcId: vpcObj.ref,
        vpnGatewayId: vgw.ref,
      });
    }

    const s3Routes: string[] = [];
    const dynamoRoutes: string[] = [];

    const gwRoutes = {
      s3: s3Routes,
      dynamodb: dynamoRoutes,
    };

    const routeTableNameToIdMap = new Map<string, string>();
    const routeTablesProps = props['route-tables'];
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
        routeTableNameToIdMap.set(routeTableName, routeTable.ref);

        // Add Routes to RouteTable
        for (const route of routeTableProp.routes!!) {
          let dependsOn: cdk.CfnResource | undefined;
          let gatewayId: string | undefined;
          if (route.target === 'IGW') {
            gatewayId = igw?.ref;
            dependsOn = igwAttach;
          } else if (route.target === 'VGW') {
            gatewayId = vgw?.ref;
            dependsOn = vgwAttach;
          } else if (route.target.toLowerCase() === 's3') {
            gwRoutes.s3.push(routeTable.ref);
            continue;
          } else if (route.target.toLowerCase() === 'dynamodb') {
            gwRoutes.dynamodb.push(routeTable.ref);
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
      for (const subnetDefinition of subnetConfig.definitions) {
        if (subnetDefinition.disabled) {
          continue;
        }

        // TODO Move this splitting stuff to a function so we can test it
        const az = props.region?.split('-')[props.region?.split('-').length - 1] + subnetDefinition.az;

        const subnetName = `${vpcName}_${propSubnetName}_az${az}`;
        const subnet = new ec2.CfnSubnet(this, subnetName, {
          cidrBlock: subnetDefinition.cidr.toCidrString(),
          vpcId: vpcObj.ref,
          availabilityZone: `${props.region}${subnetDefinition.az}`,
        });
        subnetAzs.push(subnet.ref);

        // Attach Subnet to Route-Table
        const routeTableName = subnetDefinition['route-table'];
        if (routeTableName === 'default') {
          continue;
        }

        // Find the route table ID for the route table name
        const routeTableId = routeTableNameToIdMap.get(routeTableName);
        if (!routeTableId) {
          throw new Error(`Cannot find route table with name "${routeTableName}"`);
        }

        // Associate the route table with the subnet
        new ec2.CfnSubnetRouteTableAssociation(this, `${subnetName}_ ${routeTableName}`, {
          routeTableId,
          subnetId: subnet.ref,
        });
      }
      this.subnets.set(propSubnetName, subnetAzs);
    }

    // Create VPC Gateway End Point
    for (const gwEndpointName of props['gateway-endpoints']!!) {
      const gwService = new ec2.GatewayVpcEndpointAwsService(gwEndpointName.toLowerCase());
      new ec2.CfnVPCEndpoint(this, `Endpoint_${gwEndpointName}`, {
        serviceName: gwService.name,
        vpcId: vpcObj.ref,
        routeTableIds: gwEndpointName === 's3' ? gwRoutes.s3 : gwRoutes.dynamodb,
      });
    }
    this.vpcId = vpcObj.ref;
  }
}
