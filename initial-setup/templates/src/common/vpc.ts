import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { pascalCase } from 'pascal-case';
import {
  VpcConfig,
  VirtualPrivateGatewayConfig,
  NatGatewayConfig,
  InterfaceEndpointConfig,
} from '@aws-pbmm/common-lambda/lib/config';
import { Account, getAccountId } from '../utils/accounts';
import { VpcSubnetShare } from './vpc-subnet-share';
import { InterfaceEndpoints } from './interface-endpoints';
import { VpcStack } from '../apps/main';
import { FlowLogs } from './flow-logs';
import { Region } from '@aws-pbmm/common-lambda/lib/config/types';

interface CommonProps {
  accounts: Account[];
  vpcConfig: VpcConfig;
  /**
   * The name of the organizational unit if this VPC is in an organizational unit account.
   */
  organizationalUnitName?: string;
}

export interface VpcProps extends cdk.StackProps, CommonProps {}

export class Vpc extends cdk.Construct {
  readonly name: string;
  readonly region: Region;

  readonly vpcId: string;
  readonly azSubnets = new Map<string, string[]>();
  readonly subnets = new Map<string, string>();
  readonly routeTableNameToIdMap = new Map<string, string>();

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
    if (VirtualPrivateGatewayConfig.is(vgwConfig)) {
      // Create VGW
      vgw = new ec2.CfnVPNGateway(this, `${props.vpcConfig.name}_vpg`, {
        type: 'ipsec.1',
        amazonSideAsn: vgwConfig.asn,
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
    for (const subnetConfig of subnetsConfig) {
      const subnetAzs: string[] = [];
      const propSubnetName = subnetConfig.name;
      for (const [key, subnetDefinition] of subnetConfig.definitions.entries()) {
        if (subnetDefinition.disabled) {
          continue;
        }

        const subnetCidr = subnetDefinition.cidr?.toCidrString() || subnetDefinition.cidr2?.toCidrString();
        if (!subnetCidr) {
          throw new Error(`Subnet with name "${propSubnetName}" does not have a CIDR block`);
        }

        const subnetName = `${vpcName}_${propSubnetName}_az${key + 1}`;
        const subnet = new ec2.CfnSubnet(this, subnetName, {
          cidrBlock: subnetCidr,
          vpcId: vpcObj.ref,
          availabilityZone: `${this.region}${subnetDefinition.az}`,
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
    if (NatGatewayConfig.is(natgwProps)) {
      const subnetId = this.subnets.get(natgwProps.subnet);
      if (!subnetId) {
        throw new Error(`Cannot find NAT gateway subnet name "${natgwProps.subnet}"`);
      }

      const eip = new ec2.CfnEIP(this, 'EIP_shared-network');

      const natgw = new ec2.CfnNatGateway(this, `ntgw_${vpcName}`, {
        allocationId: eip.attrAllocationId,
        subnetId,
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
    } else {
      console.log(`Skipping NAT gateway creation`);
    }

    // Create interface endpoints
    const interfaceEndpointConfig = vpcConfig['interface-endpoints'];
    if (InterfaceEndpointConfig.is(interfaceEndpointConfig)) {
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

      new FlowLogs(this, 'FlowLogs', {
        vpcId: this.vpcId,
        bucketArn: flowLogBucket.bucketArn,
      });
    }

    // Share VPC subnet
    new VpcSubnetSharing(this, 'Sharing', {
      accounts,
      vpcConfig,
      organizationalUnitName,
      subnetNameToSubnetIdsMap: this.azSubnets,
    });
  }
}

interface VpcSubnetSharingProps extends CommonProps {
  subnetNameToSubnetIdsMap: Map<string, string[]>;
}

/**
 * Auxiliary construct that takes care of VPC subnet sharing.
 */
class VpcSubnetSharing extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: VpcSubnetSharingProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const { accounts, vpcConfig, subnetNameToSubnetIdsMap, organizationalUnitName } = props;

    const subnets = vpcConfig.subnets || [];
    for (const subnet of subnets) {
      const subnetIds = subnetNameToSubnetIdsMap.get(subnet.name);
      if (!subnetIds) {
        throw new Error(`Cannot find subnet with name "${subnet.name}" in VPC`);
      }

      // Share to accounts with a specific name
      const shareToAccounts = subnet['share-to-specific-accounts'] || [];
      const shareToAccountIds = shareToAccounts.map(key => getAccountId(accounts, key));

      // Share to accounts in this OU
      const shareToOuAccounts = subnet['share-to-ou-accounts'];
      if (shareToOuAccounts) {
        if (!organizationalUnitName) {
          throw new Error(`Cannot share subnet with OU accounts because the subnet is not in a OU`);
        }

        const ouAccounts = accounts.filter(a => a.ou === organizationalUnitName);
        const ouAccountIds = ouAccounts.map(a => getAccountId(accounts, a.key));
        shareToAccountIds.push(...ouAccountIds);
      }

      if (shareToAccountIds.length > 0) {
        const shareName = `${pascalCase(vpcConfig.name)}-${pascalCase(subnet.name)}`;

        new VpcSubnetShare(this, `Share${shareName}`, {
          name: shareName,
          subnetIds,
          sourceAccountId: stack.account,
          targetAccountIds: shareToAccountIds,
          region: vpcConfig.region,
        });
      }
    }
  }
}
