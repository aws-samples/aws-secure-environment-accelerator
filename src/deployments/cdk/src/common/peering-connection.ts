import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { PcxRouteConfig, PcxRouteConfigType, ResolvedVpcConfig } from '@aws-accelerator/common-config/src';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getVpcConfig } from './get-all-vpcs';
import { StructuredOutput } from './structured-output';
import { PcxOutput, PcxOutputType } from '../deployments/vpc-peering/outputs';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';

export namespace PeeringConnection {
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
    vpcConfigs: ResolvedVpcConfig[];
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
      const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
        outputs,
        accountKey,
        vpcName,
      });
      if (!vpcOutput) {
        console.warn(`No VPC Created with name "${vpcName}"`);
        return;
      }
      const routeTable = vpcConfig?.['route-tables']?.find(x => x.routes?.find(y => y.target === 'pcx'));
      if (!routeTable) {
        return;
      }
      const routes = routeTable?.routes;
      if (!routes) {
        return;
      }
      const routeTableId = vpcOutput.routeTables[routeTable.name];
      if (!routeTableId) {
        console.warn(`Cannot find route table with name "${routeTable?.name}"`);
        return;
      }
      for (const route of routes) {
        if (!PcxRouteConfigType.is(route.destination)) {
          continue;
        }
        const pcxRoute: PcxRouteConfig = route.destination;
        const targetVpcConfig = getVpcConfig(vpcConfigs, pcxRoute.account, pcxRoute.vpc);
        const targetSubnet = targetVpcConfig?.subnets?.find(x => x.name === pcxRoute.subnet);
        if (!targetSubnet) {
          console.warn(`No subnet Config Found for "${pcxRoute.subnet}" in VPC "${pcxRoute.vpc}"`);
          continue;
        }

        const peerVpcOutputs: PcxOutput[] = StructuredOutput.fromOutputs(outputs, {
          type: PcxOutputType,
        });
        // Find the PCX output that contains the PCX route's VPC
        const peerVpcOutput = peerVpcOutputs.find(output => {
          const pcxVpc = output.vpcs.find(vpc => vpc.accountKey === pcxRoute.account && vpc.vpcName === pcxRoute.vpc);
          return !!pcxVpc;
        });
        const pcxId = peerVpcOutput?.pcxId;
        if (!pcxId) {
          console.warn(`No PCX found for for VPC "${vpcName}"`);
          continue;
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
