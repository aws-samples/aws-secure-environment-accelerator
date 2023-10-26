/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import hashSum from 'hash-sum';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as config from '@aws-accelerator/common-config/src';
import { Region } from '@aws-accelerator/common-types';
import * as constructs from '@aws-accelerator/cdk-constructs/src/vpc';
import { Account, getAccountId } from '../utils/accounts';
import { VpcSubnetSharing } from './vpc-subnet-sharing';
import { Nacl } from './nacl';
import { Limiter } from '../utils/limits';
import { TransitGatewayAttachment, TransitGatewayRoute } from '../common/transit-gateway-attachment';
import { SecurityGroup } from './security-group';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AccountStacks } from '../common/account-stacks';
import {
  TransitGatewayOutputFinder,
  TransitGatewayOutput,
  TransitGatewayAttachmentOutput,
} from '@aws-accelerator/common-outputs/src/transit-gateway';
import { CfnTransitGatewayAttachmentOutput } from '../deployments/transit-gateway/outputs';
import * as defaults from '../deployments/defaults';
import { AddTagsToResourcesOutput } from './add-tags-to-resources-output';
import { VpcDefaultSecurityGroup } from '@aws-accelerator/custom-resource-vpc-default-security-group';
import { VpcOutput } from '@aws-accelerator/common-outputs/src/vpc';
import { ModifyTransitGatewayAttachment } from '@aws-accelerator/custom-resource-ec2-modify-transit-gateway-vpc-attachment';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import {
  AssignedSubnetCidrPool,
  AssignedVpcCidrPool,
  getSubnetCidrPools,
  getVpcCidrPools,
} from '@aws-accelerator/common-outputs/src/cidr-pools';
import { Nfw } from './nfw';
import { AlbIpForwarding } from './alb-ip-forwarding';
import { Construct } from 'constructs';

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
  tgwDeployments?: config.TgwDeploymentConfig[];
  /**
   * The name of the organizational unit if this VPC is in an organizational unit account.
   */
  organizationalUnitName?: string;
  limiter: Limiter;
  /**
   * All VPC Configs to read Subnet Cidrs for Security Group and NACLs creation
   */
  vpcConfigs?: config.ResolvedVpcConfig[];
  /**
   * List of account stacks in the organization.
   */
  accountStacks: AccountStacks;

  ddbKmsKey?: string;

  acceleratorPrefix?: string;
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

export interface TgwAttachment {
  name: string;
  id: string;
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

export interface VpcProps extends VpcCommonProps {
  outputs: StackOutput[];
  acceleratorName: string;
  installerVersion: string;
  vpcPools: AssignedVpcCidrPool[];
  subnetPools: AssignedSubnetCidrPool[];
  existingAttachments: TransitGatewayAttachmentOutput[];
  vpcOutput?: VpcOutput;
  logBucket?: defaults.RegionalBucket;
}

export class VpcStack extends cdk.NestedStack {
  readonly vpc: Vpc;

  constructor(scope: Construct, name: string, props: VpcProps) {
    super(scope, name);

    // Create the VPC
    this.vpc = new Vpc(this, props.vpcConfig.name, props);
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
export class Vpc extends Construct implements constructs.Vpc {
  readonly name: string;
  readonly region: Region;

  readonly vpcId: string;
  readonly azSubnets = new AzSubnets();

  readonly cidrBlock: string;
  readonly cidr2Block: string[] = [];
  readonly additionalCidrBlocks: string[] = [];

  readonly securityGroup?: SecurityGroup;
  readonly routeTableNameToIdMap: NameToIdMap = {};
  readonly natgwNameToIdMap: NameToIdMap = {};
  readonly tgwAttachments: TgwAttachment[] = [];
  readonly nfw?: Nfw;
  readonly ddbKmsKey: string;

  constructor(scope: Construct, name: string, vpcProps: VpcProps) {
    super(scope, name);

    const props = { vpcProps };

    const {
      accountKey,
      accounts,
      vpcConfig,
      organizationalUnitName,
      limiter,
      vpcConfigs,
      accountStacks,
      acceleratorName,
      installerVersion,
      vpcOutput,
      vpcPools,
      subnetPools,
      existingAttachments,
    } = props.vpcProps;
    const vpcName = props.vpcProps.vpcConfig.name;
    const currentVpcPools: AssignedVpcCidrPool[] = [];
    const currentSubnetPools: AssignedSubnetCidrPool[] = [];
    if (['lookup', 'dynamic'].includes(vpcConfig['cidr-src'])) {
      currentVpcPools.push(
        ...getVpcCidrPools(vpcPools, accountKey, vpcConfig.region, vpcConfig.name, organizationalUnitName),
      );
      currentSubnetPools.push(
        ...getSubnetCidrPools({
          subnetPools,
          accountKey,
          region: vpcConfig.region,
          vpcName: vpcConfig.name,
          organizationalUnitName,
        }),
      );
    }
    this.ddbKmsKey = props.vpcProps.ddbKmsKey || '';
    this.name = props.vpcProps.vpcConfig.name;
    const vpcCidrs = props.vpcProps.vpcConfig.cidr;
    this.region = vpcConfig.region;
    // Retrive CIDR
    if (props.vpcProps.vpcConfig['cidr-src'] === 'dynamic') {
      this.cidrBlock = currentVpcPools.find(vpcPool => vpcPool.pool === vpcCidrs[0].pool)?.cidr!;
      if (!this.cidrBlock) {
        throw new Error(`No CIDR found for VPC : ${vpcConfig.name} in DynamoDB "cidr-vpc-assign"`);
      }
      if (vpcCidrs.length > 1) {
        this.cidr2Block.push(...currentVpcPools.filter(vpcPool => vpcPool.pool !== vpcCidrs[0].pool).map(c => c.cidr));
      }
    } else if (props.vpcProps.vpcConfig['cidr-src'] === 'lookup') {
      if (currentVpcPools.length === 0) {
        throw new Error(`No CIDR found for VPC : ${vpcConfig.name} in DDB`);
      }
      currentVpcPools.sort((a, b) => (a['vpc-assigned-id']! > b['vpc-assigned-id']! ? 1 : -1));
      this.cidrBlock = currentVpcPools[0].cidr;
      if (currentVpcPools.length > 1) {
        this.cidr2Block.push(...currentVpcPools.slice(1, currentVpcPools.length).map(c => c.cidr));
      }
    } else {
      if (!vpcCidrs) {
        throw new Error(`No CIDR found for VPC : ${vpcConfig.name} in Configuration`);
      }

      this.cidrBlock = vpcCidrs[0].value?.toCidrString()!;
      if (vpcCidrs.length > 1) {
        this.cidr2Block.push(...vpcCidrs.slice(1, vpcCidrs.length).map(c => c.value?.toCidrString()!));
      }
    }

    // Create Custom VPC using CFN construct as tags override option not available in default construct
    const vpcObj = new ec2.CfnVPC(this, vpcName, {
      cidrBlock: this.cidrBlock,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      instanceTenancy: props.vpcProps.vpcConfig['dedicated-tenancy']
        ? ec2.DefaultInstanceTenancy.DEDICATED
        : ec2.DefaultInstanceTenancy.DEFAULT,
    });
    this.vpcId = vpcObj.ref;
    const lgw = props.vpcProps.vpcConfig['lgw-route-table-id'];
    if (lgw) {
      new ec2.CfnLocalGatewayRouteTableVPCAssociation(this, `${vpcName}-${lgw}`, {
        localGatewayRouteTableId: lgw,
        vpcId: this.vpcId,
      });
    }

    const extendVpc: ec2.CfnVPCCidrBlock[] = [];
    this.cidr2Block.forEach((additionalCidr, index) => {
      let id = `ExtendVPC-${index}`;
      if (index === 0) {
        id = 'ExtendVPC';
      }
      const extendVpcCidr = new ec2.CfnVPCCidrBlock(this, id, {
        cidrBlock: additionalCidr,
        vpcId: vpcObj.ref,
      });
      extendVpc.push(extendVpcCidr);
      this.additionalCidrBlocks.push(additionalCidr);
    });

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
      console.log(`Deploying Subnet ${subnetName}`);
      for (const subnetDefinition of subnetConfig.definitions.values()) {
        if (subnetDefinition.disabled) {
          continue;
        }
        let subnetCidr: string = '';
        if (['lookup', 'dynamic'].includes(vpcConfig['cidr-src'])) {
          const subnetCidrPool = currentSubnetPools.find(
            s =>
              s.az === subnetDefinition.az &&
              s['subnet-name'] === subnetConfig.name &&
              s['vpc-name'] === vpcConfig.name &&
              s.region === vpcConfig.region,
          );
          if (subnetCidrPool) {
            subnetCidr = subnetCidrPool.cidr;
          }
        } else {
          subnetCidr = subnetDefinition.cidr?.value?.toCidrString()!;
        }
        if (!subnetCidr) {
          console.log(`Subnet with name "${subnetName}" and AZ "${subnetDefinition.az}" does not have a CIDR block`);
          continue;
        }
        let availabilityZone = subnetDefinition.az;
        if (availabilityZone.length === 1) {
          availabilityZone = `${this.region}${subnetDefinition.az}`;
        }
        const subnetId = `${subnetName}_${vpcName}_az${subnetDefinition.az}`;
        console.log(`Creating subnet ${subnetId}`);
        const subnet = new ec2.CfnSubnet(this, subnetId, {
          cidrBlock: subnetCidr,
          vpcId: vpcObj.ref,
          availabilityZone,
          outpostArn: subnetDefinition['outpost-arn'],
        });
        for (const extensions of extendVpc) {
          subnet.addDependency(extensions);
        }

        this.azSubnets.push({
          subnet,
          subnetName,
          id: subnet.ref,
          name: subnetName,
          cidrBlock: subnetCidr,
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
          vpcPools,
          subnetPools,
        });
      }
    }

    let tgw: TransitGatewayOutput | undefined;
    let tgwAttachment: TransitGatewayAttachment | undefined;
    if (config.TransitGatewayAttachConfigType.is(tgwAttach)) {
      const tgwName = tgwAttach['associate-to-tgw'];

      // Find TGW in outputs
      tgw = TransitGatewayOutputFinder.tryFindOneByName({
        outputs: vpcProps.outputs,
        accountKey: tgwAttach.account,
        name: tgwName,
      });
      if (!tgw) {
        throw new Error(`Cannot find transit gateway with name "${tgwName}"`);
      } else {
        const attachSubnetsConfig = tgwAttach['attach-subnets'] || [];
        const associateConfig = tgwAttach['tgw-rt-associate'] || [];
        const propagateConfig = tgwAttach['tgw-rt-propagate'] || [];
        const blackhole = tgwAttach['blackhole-route'];
        const subnetIds: string[] = [];
        if (vpcOutput && vpcOutput.initialSubnets.length > 0) {
          subnetIds.push(
            ...attachSubnetsConfig.flatMap(
              subnet =>
                vpcOutput.initialSubnets
                  .filter(s => s.subnetName === subnet)
                  .map(sub => this.azSubnets.getAzSubnetIdForNameAndAz(sub.subnetName, sub.az)!) || [],
            ),
          );
        } else if (vpcOutput) {
          subnetIds.push(
            ...attachSubnetsConfig.flatMap(
              subnet =>
                vpcOutput.subnets
                  .filter(s => s.subnetName === subnet)
                  .map(sub => this.azSubnets.getAzSubnetIdForNameAndAz(sub.subnetName, sub.az)!) || [],
            ),
          );
        } else {
          subnetIds.push(
            ...attachSubnetsConfig.flatMap(subnet => this.azSubnets.getAzSubnetIdsForSubnetName(subnet) || []),
          );
        }
        if (subnetIds.length === 0) {
          // TODO Throw or warn?
          // throw new Error(`Cannot attach to TGW ${tgw.name}: no subnets found to attach to for VPC ${vpcConfig.name}`);
        }

        const tgwRouteAssociates = associateConfig.map(route => tgw!.tgwRouteTableNameToIdMap[route]);
        const tgwRoutePropagates = propagateConfig.map(route => tgw!.tgwRouteTableNameToIdMap[route]);

        // Attach VPC To TGW
        tgwAttachment = new TransitGatewayAttachment(this, 'TgwAttach', {
          name: `${vpcConfig.name}_${tgw.name}_att`,
          vpcId: this.vpcId,
          subnetIds,
          transitGatewayId: tgw.tgwId,
        });

        const currentSubnets = attachSubnetsConfig.flatMap(
          subnet => this.azSubnets.getAzSubnetIdsForSubnetName(subnet) || [],
        );

        const ec2OpsRole = IamRoleOutputFinder.tryFindOneByName({
          outputs: props.vpcProps.outputs,
          accountKey,
          roleKey: 'Ec2Operations',
        });
        if (ec2OpsRole) {
          const modifyTgwAttach = new ModifyTransitGatewayAttachment(this, 'ModifyTgwAttach', {
            roleArn: ec2OpsRole.roleArn,
            subnetIds: currentSubnets,
            transitGatewayAttachmentId: tgwAttachment.transitGatewayAttachmentId,
            ignoreWhileDeleteSubnets: subnetIds,
          });
          modifyTgwAttach.node.addDependency(tgwAttachment);
        }

        // TODO add VPC To TGW attachment output
        this.tgwAttachments.push({
          name: tgw.name,
          id: tgwAttachment.transitGatewayAttachmentId,
        });

        const ownerAccountId = getAccountId(accounts, tgwAttach.account);
        if (ownerAccountId) {
          // Add tags in the TGW owner account
          new AddTagsToResourcesOutput(this, 'TgwAttachTags', {
            dependencies: [tgwAttachment],
            produceResources: () => [
              {
                resourceId: tgwAttachment!.transitGatewayAttachmentId,
                resourceType: 'tgw-attachment',
                tags: tgwAttachment!.resource.tags.renderTags(),
                targetAccountIds: [ownerAccountId],
                region: cdk.Aws.REGION,
              },
            ],
          });
        }

        // in case TGW attachment is created for the same account, we create using the same stack
        // otherwise, we will store tgw attachment output and do it in next phase
        if (tgwAttach.account === accountKey) {
          new TransitGatewayRoute(this, 'TgwRoute', {
            tgwAttachmentId: tgwAttachment.transitGatewayAttachmentId,
            tgwRouteAssociates,
            tgwRoutePropagates,
            blackhole,
            cidr: this.cidrBlock,
          });
        } else {
          let constructIndex: string;
          let existingAttachment: TransitGatewayAttachmentOutput | undefined;
          existingAttachment = existingAttachments.find(
            att =>
              att.accountKey === tgwAttach.account &&
              att.region === this.region &&
              att.cidr === this.cidrBlock &&
              att.vpc === vpcName,
          );
          if (!existingAttachment) {
            existingAttachment = existingAttachments.find(
              att => att.accountKey === tgwAttach.account && att.region === this.region && att.cidr === this.cidrBlock,
            );
          }
          if (!existingAttachment) {
            // Generate hash
            constructIndex = hashSum({
              accountKey: tgwAttach.account,
              rgion: this.region,
              cidr: this.cidrBlock,
              vpc: vpcName,
            });
          } else {
            // This might cause failure if existing users already having multiple tgw cross account attachments in same account and region
            constructIndex =
              existingAttachment.constructIndex ||
              existingAttachments
                .findIndex(
                  att =>
                    att.accountKey === tgwAttach.account && att.region === this.region && att.cidr === this.cidrBlock,
                )
                .toString();
          }
          new CfnTransitGatewayAttachmentOutput(this, 'TgwAttachmentOutput', {
            accountKey: tgwAttach.account,
            region: this.region,
            tgwAttachmentId: tgwAttachment.transitGatewayAttachmentId,
            tgwRouteAssociates,
            tgwRoutePropagates,
            blackhole: blackhole ?? false,
            cidr: this.cidrBlock,
            vpc: vpcName,
            constructIndex,
          });
        }
      }
    }

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
        console.log(`Creating natgw for Subnet "${natSubnet.name}" az: "${natSubnet.az}"`);
        const natGWName = `NATGW_${natSubnet.name}_${natSubnet.az}_natgw`;
        const eip = new ec2.CfnEIP(this, `EIP_natgw_${natSubnet.az}`);
        const natgw = new ec2.CfnNatGateway(this, natGWName, {
          allocationId: eip.attrAllocationId,
          subnetId: natSubnet.id,
        });
        this.natgwNameToIdMap[`NATGW_${natSubnet.name}_az${natSubnet.az.toUpperCase()}`.toLowerCase()] = natgw.ref;
      }
    }

    const nfwProps = vpcConfig.nfw;
    if (config.AWSNetworkFirewallConfig.is(nfwProps)) {
      const subnetConfig = nfwProps.subnet;
      const nfwSubnets: AzSubnet[] = [];
      if (subnetConfig.az) {
        nfwSubnets.push(this.azSubnets.getAzSubnetForNameAndAz(subnetConfig.name, subnetConfig.az)!);
      } else {
        nfwSubnets.push(...this.azSubnets.getAzSubnetsForSubnetName(subnetConfig.name));
      }

      // Find the role that will create the loggroup for the NFW
      const logGroupRole = IamRoleOutputFinder.tryFindOneByName({
        outputs: props.vpcProps.outputs,
        accountKey,
        roleKey: 'LogGroupRole',
      });

      this.nfw = new Nfw(this, `${nfwProps['firewall-name']}`, {
        nfwPolicy: nfwProps.policyString,
        nfwPolicyConfig: nfwProps.policy || { name: 'Sample-Firewall-Policy', path: 'nfw/nfw-example-policy.json' },
        subnets: nfwSubnets,
        vpcId: this.vpcId,
        nfwName: nfwProps['firewall-name'] || `${vpcConfig.name}-nfw`,
        acceleratorPrefix: vpcProps.acceleratorPrefix || '',
        nfwFlowLogging: nfwProps['flow-dest'] || 'None',
        nfwAlertLogging: nfwProps['alert-dest'] || 'None',
        logGroupRoleArn: logGroupRole?.roleArn ?? '', // Make the state machine fails for the firewall, something is wrong we did not find a loggroup role and we should
        logBucket: vpcProps.logBucket,
      });
    }

    if (vpcConfig?.['alb-forwarding']) {
      console.log('Deploying ALB forwarding');
      const albipforward = new AlbIpForwarding(this, 'albIpForwarding', {
        vpcId: this.vpcId,
        ddbKmsKey: this.ddbKmsKey,
        acceleratorPrefix: vpcProps.acceleratorPrefix || '',
      });
      console.log('ALB forwarding enabled');
    } else {
      console.log('alb ip forwarding not enabled. Skipping.');
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
          } else if (route.target === 'TGW' && tgw && tgwAttachment) {
            let constructName = `${routeTableName}_${route.target}`;
            if (typeof route.destination !== 'string') {
              console.warn(`Route for TGW only supports cidr as destination`);
              continue;
            }
            if (route.destination !== '0.0.0.0/0') {
              constructName = `${routeTableName}_${route.target}_${route.destination}`;
            }
            const tgwRoute = new ec2.CfnRoute(this, constructName, {
              routeTableId: routeTableObj,
              destinationCidrBlock: route.destination,
              transitGatewayId: tgw.tgwId,
            });
            tgwRoute.addDependency(tgwAttachment.resource);
            continue;
          } else if (route.target.startsWith('NATGW_')) {
            if (typeof route.destination !== 'string') {
              console.warn(`Route for NATGW only supports cidr as destination`);
              continue;
            }
            let constructName = `${routeTableName}_natgw_route`;
            if (route.destination !== '0.0.0.0/0') {
              constructName = `${routeTableName}_natgw_${route.destination}_route`;
            }
            const routeParams: ec2.CfnRouteProps = {
              routeTableId: routeTableObj,
              destinationCidrBlock: route.destination,
              natGatewayId: this.natgwNameToIdMap[route.target.toLowerCase()],
            };
            new ec2.CfnRoute(this, constructName, routeParams);
            continue;
          } else if (route.target === 'customer') {
            if (!route.type || !route['target-id']) {
              console.warn(
                `type and target-id are required when using customer as target for route for the route ${route.name}`,
              );
              continue;
            }
            const constructName = `${routeTableName}_${route.type}_${route['target-id']}`;
            const routeParams: ec2.CfnRouteProps = {
              routeTableId: routeTableObj,
              [route.type]: route['target-id'],
              destinationCidrBlock: route.destination as string,
            };
            new ec2.CfnRoute(this, constructName, routeParams);
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
            cfnRoute.addDependency(dependsOn);
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

    // Create all security groups
    if (vpcConfig['security-groups']) {
      this.securityGroup = new SecurityGroup(this, `SecurityGroups-${vpcConfig.name}`, {
        securityGroups: vpcConfig['security-groups'],
        vpcName: vpcConfig.name,
        vpcId: this.vpcId,
        accountKey,
        vpcConfigs: vpcConfigs!,
        installerVersion,
        vpcPools,
        subnetPools,
      });
    }

    // Share VPC subnet
    new VpcSubnetSharing(this, 'Sharing', {
      accountStacks,
      accountKey,
      accounts,
      vpcConfig,
      organizationalUnitName,
      subnets: this.azSubnets,
      limiter,
      vpc: vpcObj,
    });

    const vpcSecurityGroup = new VpcDefaultSecurityGroup(this, 'VpcDefaultSecurityGroup', {
      vpcId: this.vpcId,
      acceleratorName,
    });
    vpcSecurityGroup.node.addDependency(vpcObj);
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

  get tgwAVpcAttachments(): constructs.TgwAttachment[] {
    return this.tgwAttachments;
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

  findRouteTableIdByName(name: string): string {
    const routeTable = this.tryFindRouteTableIdByName(name);
    if (!routeTable) {
      throw new Error(`Cannot find route table with name "${name}"`);
    }
    return routeTable;
  }

  tryFindRouteTableIdByName(name: string): string | undefined {
    return this.routeTableNameToIdMap[name];
  }
}
