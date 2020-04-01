import * as cdk from '@aws-cdk/core';
import { VPC } from '../common/VPC';
import { TransitGateway, TransitGatewayProps } from '../common/TransitGateway';
import { TransitGatewayAttachment, TransitGatewayAttachmentProps } from '../common/TransitGatewayAttachment';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';

export namespace SharedNetwork {
  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
      super(scope, id, props);
      let accountProps = props as AccountConfig;

      // Create VPC, Subnets, RouteTables and Routes on Shared-Network Account
      const vpcConfig = accountProps.vpc;
      const vpc = new VPC(this, 'vpc', vpcConfig);
      
      // Creating TGW for Shared-Network Account
      let tgw;
      const deployments = accountProps.deployments;
      if("tgw" in deployments){
        tgw = new TransitGateway(this, deployments.tgw.name, deployments.tgw);
      }

      if ("tgw-attach" in vpcConfig && tgw){
        
        // TBD Account Check

        // TBD TGW Name Check

        // **** Attach VPC to TGW ********
        // Prepare props for TGW Attachment
        let subnetIds:string[] = [];
        for(let subnet of vpcConfig["tgw-attach"]['attach-subnets']){
          subnetIds = subnetIds.concat(vpc.subets.get(subnet) as string[]);
        }
        let tgwRouteAssociations:string[] = [];
        let tgwRoutePropagates:string[] = [];
        for(let route of vpcConfig["tgw-attach"]["tgw-rt-associate"]){
          if (tgw.tgwRouteTables && tgw.tgwRouteTables.get(route)){
            tgwRouteAssociations.push(tgw.tgwRouteTables.get(route) as string)
          }
        }
        for(let route of vpcConfig["tgw-attach"]["tgw-rt-propogate"]){
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
