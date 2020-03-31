import * as cdk from '@aws-cdk/core';
import { VPC } from '../../../../common-cdk/lib/VPC';
import { TransitGateway, TransitGatewayProps } from '../../../../common-cdk/lib/TransitGateway';
import { TransitGatewayAttachment, TransitGatewayAttachmentProps } from '../../../../common-cdk/lib/TransitGatewayAttachment';

function prepareTransitGatewayProps(tgwConfig:any): TransitGatewayProps{
  let tgwProps:any = {
    dnsSupport: enableDisableProperty('DNS-support', tgwConfig.features),
    vpnEcmpSupport: enableDisableProperty('VPN-ECMP-support', tgwConfig.features),
    defaultRouteTableAssociation: enableDisableProperty('Default-Route-Table-Association', tgwConfig.features),
    defaultRouteTablePropagation: enableDisableProperty('Default-Route-Table-Propagation', tgwConfig.features),
    autoAcceptSharedAttachments: enableDisableProperty('Auto-Accept-Shared-Attachments', tgwConfig.features),
    routeTables: 'route-tables' in tgwConfig? tgwConfig["route-tables"]: []
  };
  if('asn' in tgwConfig)
    tgwProps['amazonSideAsn'] = tgwConfig.asn;
  return tgwProps as TransitGatewayProps;
}


function enableDisableProperty(feature: string, config:any){
  return feature in config? 'enable': 'disable'
}
export namespace SharedNetwork {
  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
      super(scope, id, props);

      const vpcConfig = (props as any).vpc;
      // Create VPC, Subnets, RouteTables and Routes on Shared-Network Account
      const vpc = new VPC(this, 'vpc', vpcConfig);
      
      // Creating TGW for Shared-Network Account
      let tgw;
      const deployments = (props as any).deployments;
      if("tgw" in deployments){
        let tgwName = deployments.tgw.name;
        tgw = new TransitGateway(this, tgwName, prepareTransitGatewayProps(deployments.tgw));

        new cdk.CfnOutput(this, `SharedNetwork/deployments/TGW/${tgwName}`, {value: tgw.tgw});

        tgw.tgwRouteTables.forEach((value: string, key: string) => {
          new cdk.CfnOutput(this, `SharedNetwork/deployments/TGW/${tgwName}/RouteTable${key}`, {value: value});
        });
      }

      if ("tgw-attach" in vpcConfig && tgw){
        // Attach VPC to TGW

        // TBD Account Check

        // TBD TGW Name Check
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

        for(let route of vpcConfig["tgw-attach"]["tgw-rt-propagate"]){
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
        const tgwAttach = new TransitGatewayAttachment(this, 'tgw_attach', tgwAttachProps);
      }
    }
  }
}
