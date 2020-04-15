import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { VPCSharing } from '../common/vpc-sharing';

import { VpcConfig, VirtualPrivateGatewayConfig, VpcConfigType } from '@aws-pbmm/common-lambda/lib/config';
import { getAccountId } from '../utils/accounts';

export interface VPCProps extends cdk.StackProps {
  vpcConfig: VpcConfig;
  accounts?: { key: string; id: string }[];
}

interface SubnetShareProps {
  Resources: string[];
  Tags: { Key: string; Value: string }[];
}

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
  readonly subnetTagProps: SubnetShareProps[] = [];
  readonly routeTableNameToIdMap = new Map<string, string>();

  constructor(parent: cdk.Construct, name: string, props: VPCProps) {
    super(parent, name);
    const vpcName = props.vpcConfig.name;
    // Create Custom VPC using CFN construct as tags override option not available in default construct
    const vpcObj = new ec2.CfnVPC(this, vpcName, {
      cidrBlock: props.vpcConfig.cidr!!.toCidrString(),
    });

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

    if (props.vpcConfig.vgw) {
      const vgwConfig = props.vpcConfig.vgw;
      const vgwProps: VGWProps = {
        type: 'ipsec.1',
      };
      // @ts-ignore
      if (VirtualPrivateGatewayConfig.is(vgwConfig) && vgwConfig.asn) {
        // @ts-ignore
        vgwProps.amazonSideAsn = vgwConfig.asn;
      }
      // Create VGW
      vgw = new ec2.CfnVPNGateway(this, `${props.vpcConfig.name}_vpg`, vgwProps);
      // Attach VGW to VPC
      vgwAttach = new ec2.CfnVPCGatewayAttachment(this, `${props.vpcConfig.name}_attach_vgw`, {
        vpcId: vpcObj.ref,
        vpnGatewayId: vgw.ref,
      });
    }

    const s3Routes: string[] = [];
    const dynamoRoutes: string[] = [];
    const routeTableNameToIdMap = new Map<string, string>();
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

        this.routeTableNameToIdMap.set(routeTableName, routeTable.ref);
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
    const srcAccountId = props.accounts?.find(a => a.key === props.vpcConfig.deploy)?.id;
    let subnetIndex: number = 0;
    for (const subnetConfig of subnetsConfig) {
      const subnetAzs: string[] = [];
      const propSubnetName = subnetConfig.name;
      for (const [key, subnetDefinition] of subnetConfig.definitions.entries()) {
        if (subnetDefinition.disabled) {
          continue;
        }

        // TODO Move this splitting stuff to a function so we can test it

        const az = getRegionAz(props.vpcConfig.region!!, subnetDefinition.az);
        const subnetName = `${vpcName}_${propSubnetName}_az${key + 1}`;
        const subnet = new ec2.CfnSubnet(this, subnetName, {
          cidrBlock: subnetDefinition.cidr?.toCidrString() || subnetDefinition.cidr2?.toCidrString() || '',
          vpcId: vpcObj.ref,
          availabilityZone: `${props.vpcConfig.region}${subnetDefinition.az}`,
        });
        if (extendVpc) {
          subnet.addDependsOn(extendVpc);
        }
        this.subnets.set(`${propSubnetName}_az${key + 1}`, subnet.ref);
        subnetAzs.push(subnet.ref);

        //Share Central Subnet to sub-accounts
        if (subnetConfig['share-to-specific-accounts'] && subnetConfig['share-to-specific-accounts'].length > 0) {
          let accountIndex: number = 0;
          let accountIds: string[] = [];
          const accountNames = subnetConfig['share-to-specific-accounts'];
          for (const accountName of accountNames) {
            let accountId = getAccountId(props.accounts!, accountName);
            if (accountId) {
              accountIds[accountIndex] = accountId;
              accountIndex++;
            }
          }

          if (srcAccountId) {
            new VPCSharing(this, `${vpcName}_${propSubnetName}_${key + 1}`, {
              subnetId: subnet.ref,
              sourceAccountId: srcAccountId,
              targetAccountIds: accountIds,
              region: props.vpcConfig.region,
            });
            this.subnetTagProps[subnetIndex] = {
              Resources: [subnet.ref],
              Tags: [{ Key: 'Name', Value: `${propSubnetName}_az${key + 1}` }],
            };
            subnetIndex++;
          }
        }

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
    for (const gwEndpointName of props.vpcConfig['gateway-endpoints'] ? props.vpcConfig['gateway-endpoints'] : []) {
      const gwService = new ec2.GatewayVpcEndpointAwsService(gwEndpointName.toLowerCase());
      new ec2.CfnVPCEndpoint(this, `Endpoint_${gwEndpointName}`, {
        serviceName: gwService.name,
        vpcId: vpcObj.ref,
        routeTableIds: gwEndpointName.toLocaleLowerCase() === 's3' ? s3Routes : dynamoRoutes,
      });
    }

    let natgw;
    // Create NAT Gateway
    if (props.vpcConfig.natgw) {
      const natgwProps = props.vpcConfig.natgw;
      const eip = new ec2.CfnEIP(this, 'EIP_shared-network');

      natgw = new ec2.CfnNatGateway(this, `ntgw_${vpcName}`, {
        allocationId: eip.attrAllocationId,
        // @ts-ignore
        subnetId: this.subnets.get(natgwprops.vpcConfig.subnet),
      });

      // Attach NatGw Routes to Non IGW Route Tables
      for (const natRoute of natRouteTables) {
        const routeTableId = this.routeTableNameToIdMap.get(natRoute);
        const routeParams: ec2.CfnRouteProps = {
          routeTableId: routeTableId!,
          destinationCidrBlock: '0.0.0.0/0',
          natGatewayId: natgw?.ref,
        };
        const cfnRoute = new ec2.CfnRoute(this, `${natRoute}_natgw_route`, routeParams);
      }
    }
    this.vpcId = vpcObj.ref;
  }
}
