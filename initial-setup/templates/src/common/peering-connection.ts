import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cfn from '@aws-cdk/aws-cloudformation';

import {
  VpcConfig,
  PeeringConnectionConfig,
  AccountConfig,
  OrganizationalUnitConfig,
  AcceleratorConfig,
} from '@aws-pbmm/common-lambda/lib/config';
import { Account, getAccountId } from '../utils/accounts';
import { Context } from '../utils/context';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { VpcOutput } from '../apps/phase-1';

export namespace PeeringConnection {
  interface VpcConfigsOutput {
    accountKey: string;
    vpcConfig: VpcConfig;
  }

  export function getVpcConfigForPcx(
    accountKey: string,
    config: AccountConfig | OrganizationalUnitConfig,
  ): VpcConfigsOutput | undefined {
    const vpcConfig = config?.vpc;
    if (!vpcConfig) {
      console.log(`Skipping Peering Connection creation for account "${accountKey}"`);
      return;
    }
    if (!vpcConfig.deploy) {
      console.warn(
        `Skipping Peering Connection creation for Account/Organization unit "${accountKey}" as 'deploy' is not set`,
      );
      return;
    }
    accountKey = vpcConfig.deploy === 'local' ? accountKey : vpcConfig.deploy;
    const pcxConfig = vpcConfig.pcx;
    if (!PeeringConnectionConfig.is(pcxConfig)) {
      console.log(`No Peering Connection creation Config Defined for VPC "${vpcConfig.name}"`);
      return;
    }
    console.log(`Peering Connection Config available for VPC "${vpcConfig.name}" in account "${accountKey}"`);
    return {
      accountKey,
      vpcConfig,
    };
  }
}
export interface PeeringConnectionProps {
  /**
   * Source VPC Config for Peering.
   */
  vpcConfig: VpcConfig;
  /**
   *
   * Peer VPC Config for Peering.
   */
  peerVpcConfig: VpcConfig;
  context: Context;
  /**
   * The accounts in the organization.
   */
  accounts: Account[];
  /**
   * Outputs
   */
  outputs: StackOutput[];
  /**
   * Current VPC Account Name
   */
  accountKey: string;
  /**
   * Peer Role Arn
   */
  peerRoleArn: string;
}

/**
 * Auxiliary construct that creates VPCs for organizational units.
 */
export class PeeringConnectionDeployment extends cdk.Construct {
  /**
   * We should store the relevant constructs that are created instead of storing outputs.
   * @deprecated
   */
  readonly vpcOutput?: VpcOutput;

  constructor(scope: cdk.Construct, id: string, props: PeeringConnectionProps) {
    super(scope, id);
    const { vpcConfig, peerVpcConfig, accounts, outputs, context, accountKey, peerRoleArn } = props;
    const pcxConfig = vpcConfig.pcx;
    if (!PeeringConnectionConfig.is(pcxConfig)) {
      return;
    }
    const peerOwnerId = getAccountId(accounts, pcxConfig.source);
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const peerVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey: pcxConfig.source,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(output => output.vpcName === vpcConfig.name);
    if (!vpcOutput) {
      throw new Error(`Cannot find VPC with name "${vpcConfig.name}"`);
    }
    const peerVpcOutput = peerVpcOutputs.find(output => output.vpcName === pcxConfig['source-vpc']);
    if (!peerVpcOutput) {
      throw new Error(`Cannot find VPC with name "${pcxConfig['source-vpc']}"`);
    }

    const vpcId = vpcOutput.vpcId;
    const peerVpcId = peerVpcOutput.vpcId;

    // Create VPC Peering Connection
    const pcx = new ec2.CfnVPCPeeringConnection(this, `${vpcConfig.name}-${pcxConfig['source-vpc']}_pcx`, {
      vpcId,
      peerVpcId,
      peerOwnerId,
      peerRoleArn,
    });
    vpcOutput.pcx = pcx.ref;
    // tslint:disable-next-line deprecation
    this.vpcOutput = vpcOutput;

    const peerSubnetDefnitions = peerVpcConfig.subnets?.find(x => x.name === pcxConfig['source-subnets'])?.definitions;
    const subnetDefnitions = vpcConfig.subnets?.find(x => x.name === pcxConfig['local-subnets'])?.definitions;

    if (!peerSubnetDefnitions) {
      throw new Error(`Can't find Subnet Cidr for Subnet "${pcxConfig['source-subnets']}"`);
    }

    if (!subnetDefnitions) {
      throw new Error(`Can't find Subnet Cidr for Subnet "${pcxConfig['local-subnets']}"`);
    }

    const subnetConfig = vpcConfig.subnets?.find(x => x.name === pcxConfig['local-subnets']);
    const routeTables = new Set(subnetConfig?.definitions.map(x => x['route-table']));
    for (const routeTableName of routeTables) {
      const routeTable = vpcConfig['route-tables']?.find(x => x.name === routeTableName);
      const routes = routeTable?.routes?.find(x => x.target === `pcx-${pcxConfig.source}-${pcxConfig['source-vpc']}`);
      if (routes) {
        const routeTableId = Object.entries(vpcOutput.routeTables).find(x => x[0] === routeTableName)?.[1];
        if (!routeTableId) {
          throw new Error(`Cannot find route table with name "${routeTableName}"`);
        }
        // Add Route to RouteTable
        for (const [index, subnet] of peerSubnetDefnitions.entries()) {
          if (subnet.disabled) {
            continue;
          }
          new ec2.CfnRoute(this, `${routeTableName}_pcx_${pcxConfig['source-vpc']}_${index}`, {
            routeTableId,
            destinationCidrBlock: subnet.cidr?.toCidrString() || subnet.cidr2?.toCidrString(),
            vpcPeeringConnectionId: pcx.ref,
          });
        }
      }
    }

    // Adding routes to Peer VPC Subnet Route Table
    const peerSubnetConfig = peerVpcConfig.subnets?.find(x => x.name === pcxConfig['source-subnets']);
    const peerRouteTables = new Set(peerSubnetConfig?.definitions.map(x => x['route-table']));
    for (const routeTableName of peerRouteTables) {
      const routeTable = peerVpcConfig['route-tables']?.find(x => x.name === routeTableName);
      const routes = routeTable?.routes?.find(x => x.target === `pcx-${accountKey}-${vpcConfig.name}`);
      if (!routes) {
        continue;
      }
      const routeTableId = Object.entries(peerVpcOutput.routeTables).find(x => x[0] === routeTableName)?.[1];
      if (!routeTableId) {
        throw new Error(`Cannot find route table with name "${routeTableName}"`);
      }

      // Add Route to RouteTable
      for (const [index, subnet] of subnetDefnitions.entries()) {
        if (subnet.disabled) {
          continue;
        }
        const getDnsEndpointIpsLambda = lambda.Function.fromFunctionArn(
          this,
          `CfnAddPcxRoute-${index}`,
          context.customResourceFunctions.find(x => x.functionName === 'CfnCustomResourceAddPcxRouteLamba')
            ?.functionArn!,
        );

        // Create CfnCustom Resource to get IPs which are alloted to InBound Endpoint
        const getDnsEndpointIpsResource = new cfn.CustomResource(this, `PcxRoute-${routeTableName}-${index}`, {
          provider: cfn.CustomResourceProvider.fromLambda(getDnsEndpointIpsLambda),
          properties: {
            RouteTableId: routeTableId,
            AccountId: peerOwnerId,
            PeeringConnectionId: pcx.ref,
            DestinationCidrBlock: subnet.cidr?.toCidrString() || subnet.cidr2?.toCidrString(),
          },
        });
      }
    }
  }
}
