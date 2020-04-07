import * as cdk from '@aws-cdk/core';
import { Vpc } from '../common/vpc';

import { FlowLogs } from '../common/flow-logs';

import { TransitGateway } from '../common/transit-gateway';
import { TransitGatewayAttachment, TransitGatewayAttachmentProps } from '../common/transit-gateway-attachment';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';

export namespace SharedNetwork {
  export interface StackProps extends cdk.StackProps {
    accountConfig: AccountConfig;
  }

  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      const accountProps = props.accountConfig;

      // Create VPC, Subnets, RouteTables and Routes on Shared-Network Account
      const vpcConfig = accountProps.vpc!!;
      const vpc = new Vpc(this, 'vpc', vpcConfig);

      //Creating FlowLog for VPC
      const flowLog = new FlowLogs(this, 'flowlog', { vpcId: vpc.vpcId });

      // Creating TGW for Shared-Network Account
      const deployments = accountProps.deployments;
      const twgDeployment = deployments.tgw;
      const twgAttach = vpcConfig['tgw-attach'];
      if (twgDeployment) {
        const tgw = new TransitGateway(this, twgDeployment.name!!, twgDeployment);
        if (twgAttach) {
          // TBD Account Check

          // TBD TGW Name Check

          // **** Attach VPC to TGW ********
          // Prepare props for TGW Attachment
          let subnetIds: string[] = [];
          const vpcTgwAttach = vpcConfig['tgw-attach']!!;
          const vpcTgwAttachSubnets = vpcTgwAttach['attach-subnets']!!;
          for (const subnet of vpcTgwAttachSubnets) {
            subnetIds = subnetIds.concat(vpc.azSubnets.get(subnet) as string[]);
          }

          const tgwRouteAssociations: string[] = [];
          const tgwRoutePropagates: string[] = [];
          const vpcTgwRTAssociate = vpcTgwAttach['tgw-rt-associate']!!;
          for (const route of vpcTgwRTAssociate) {
            if (tgw.tgwRouteTableNameToIdMap && tgw.tgwRouteTableNameToIdMap.get(route)) {
              tgwRouteAssociations.push(tgw.tgwRouteTableNameToIdMap.get(route) as string);
            }
          }
          const vpcTgwRTPropagate = vpcTgwAttach['tgw-rt-propagate']!!;
          for (const route of vpcTgwRTPropagate) {
            if (tgw.tgwRouteTableNameToIdMap && tgw.tgwRouteTableNameToIdMap.get(route)) {
              tgwRoutePropagates.push(tgw.tgwRouteTableNameToIdMap.get(route) as string);
            }
          }

          const tgwAttachProps: TransitGatewayAttachmentProps = {
            vpcId: vpc.vpcId,
            subnetIds,
            transitGatewayId: tgw.tgwId,
            tgwRouteAssociates: tgwRouteAssociations,
            tgwRoutePropagates,
          };
          // Attach VPC To TGW
          new TransitGatewayAttachment(this, 'tgw_attach', tgwAttachProps);
        }
      }
    }
  }
}
