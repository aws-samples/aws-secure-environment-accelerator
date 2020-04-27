import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import {
  VpcConfig,
  PeeringConnectionConfig,
  AccountConfig,
  OrganizationalUnitConfig,
  PcxRouteConfig,
  PcxRouteConfigType,
} from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { VpcOutput } from '../apps/phase-1';
import { VpcConfigs, getVpcConfig } from './get-all-vpcs';

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

  export interface PeeringConnectionRoutesProps {
    /**
     * Source VPC Name .
     */
    accountKey: string;
    /**
     * Source VPC Name .
     */
    vpcName: string;
    /**
     *
     * All VPC Config for Creating routes.
     */
    vpcConfigs: VpcConfigs;
    /**
     * Outputs
     */
    outputs: StackOutput[];
  }

  export class PeeringConnectionRoutes extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: PeeringConnectionRoutesProps) {
      super(scope, id);

      const { accountKey, vpcName, vpcConfigs, outputs } = props;
      const vpcConfig = getVpcConfig(vpcConfigs, accountKey, vpcName);
      const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
        accountKey,
        outputType: 'VpcOutput',
      });
      const vpcOutput = vpcOutputs.find(output => output.vpcName === vpcName);
      if (!vpcOutput) {
        throw new Error(`No VPC Created with name "${vpcName}"`);
      }
      const routeTable = vpcConfig?.['route-tables']?.find(x => x.routes?.find(y => y.target.startsWith('pcx-')));
      if (!routeTable) {
        return;
      }
      const routes = routeTable?.routes;
      if (!routes) {
        return;
      }
      const routeTableId = vpcOutput.routeTables[routeTable.name];
      if (!routeTableId) {
        throw new Error(`Cannot find route table with name "${routeTable?.name}"`);
      }
      for (const route of routes) {
        if (!PcxRouteConfigType.is(route.destination)) {
          continue;
        }
        const pcxRoute: PcxRouteConfig = route.destination;
        const targetVpcConfig = getVpcConfig(vpcConfigs, pcxRoute.account, pcxRoute.vpc);
        const targetSubnet = targetVpcConfig?.subnets?.find(x => x.name === pcxRoute.subnet);
        if (!targetSubnet) {
          throw new Error(`No subnet Config Found for "${pcxRoute.subnet}" in VPC "${pcxRoute.vpc}"`);
        }
        let pcxId = vpcOutput.pcx;
        if (!pcxId) {
          const peerVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
            accountKey: pcxRoute.account,
            outputType: 'VpcOutput',
          });
          const peerVpcOutput = peerVpcOutputs.find(output => output.vpcName === pcxRoute.vpc);
          if (!vpcOutput) {
            throw new Error(`No VPC Created with name "${vpcName}"`);
          }
          pcxId = peerVpcOutput?.pcx;
        }
        // Add Route to RouteTable
        for (const [index, subnet] of targetSubnet.definitions.entries()) {
          if (subnet.disabled) {
            continue;
          }
          new ec2.CfnRoute(this, `${routeTable?.name}_pcx_${pcxRoute.vpc}_${index}`, {
            routeTableId,
            destinationCidrBlock: subnet.cidr?.toCidrString() || subnet.cidr2?.toCidrString(),
            vpcPeeringConnectionId: pcxId,
          });
        }
      }
    }
  }
}
