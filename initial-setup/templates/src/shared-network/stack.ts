import * as cdk from '@aws-cdk/core';
import { VPC } from '../common/vpc';
import { TransitGateway, TransitGatewayProps } from '../common/transit-gateway';
import { TransitGatewayAttachment, TransitGatewayAttachmentProps } from '../common/transit-gateway-attachment';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';

export namespace SharedNetwork {
  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
      super(scope, id, props);
      let accountProps = props as AccountConfig;

      // Create VPC, Subnets, RouteTables and Routes on Shared-Network Account
      const vpcConfig = accountProps.vpc!!
      const vpc = new VPC(this, 'vpc', vpcConfig);
      
      // Creating TGW for Shared-Network Account
      let tgw;
      const deployments = accountProps.deployments;
      if("tgw" in deployments){
        tgw = new TransitGateway(this, deployments["tgw"]["name"], deployments["tgw"]);
      }

      if ("tgw-attach" in vpcConfig && tgw){
        
        // TBD Account Check

        // TBD TGW Name Check

        // **** Attach VPC to TGW ********
        // Prepare props for TGW Attachment
        let subnetIds:string[] = [];
        const vpcTgwAttach = vpcConfig["tgw-attach"]!!
        const vpcTgwAttachSubnets = vpcTgwAttach['attach-subnets']!!
        for(let subnet of vpcTgwAttachSubnets){
          subnetIds = subnetIds.concat(vpc.subets.get(subnet) as string[]);
        }
        let tgwRouteAssociations:string[] = [];
        let tgwRoutePropagates:string[] = [];
        const vpcTgwRTAssociate = vpcTgwAttach['tgw-rt-associate']!!
        for(let route of vpcTgwRTAssociate){
          if (tgw.tgwRouteTables && tgw.tgwRouteTables.get(route)){
            tgwRouteAssociations.push(tgw.tgwRouteTables.get(route) as string)
          }
        }
        const vpcTgwRTPropagate = vpcTgwAttach['tgw-rt-propagate']!!
        for(let route of vpcTgwRTPropagate){
          if (tgw.tgwRouteTables && tgw.tgwRouteTables.get(route)){
            tgwRoutePropagates.push(tgw.tgwRouteTables.get(route) as string)
          }
        }

        let tgwAttachProps: TransitGatewayAttachmentProps = {
          vpcId: vpc.vpc,
          subnetIds: subnetIds,
          transitGatewayId: tgw.tgw,
          tgwRouteAssociates: tgwRouteAssociations,
          tgwRoutePropagates: tgwRoutePropagates
        }
        // Attach VPC To TGW
        const tgwAttach = new TransitGatewayAttachment(this, 'tgw_attach', tgwAttachProps);
      }
    }
  }
}
