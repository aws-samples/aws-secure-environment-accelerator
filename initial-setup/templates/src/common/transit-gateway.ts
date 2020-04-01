import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import { DeploymentConfig } from '@aws-pbmm/common-lambda/lib/config';

export interface TransitGatewayProps {
  amazonSideAsn?: number,
  autoAcceptSharedAttachments: string,
  defaultRouteTableAssociation: string,
  defaultRouteTablePropagation: string,
  dnsSupport: string,
  vpnEcmpSupport: string,
  routeTables: string[],
  tags?: any[]
}


function prepareTransitGatewayProps(tgwConfig:DeploymentConfig): TransitGatewayProps{
    const tgwFeatures = tgwConfig.features!!
    const tgwRouteTables = tgwConfig["route-tables"]!!
    let tgwProps:TransitGatewayProps = {
      // @ts-ignore
      dnsSupport: enableDisableProperty(tgwFeatures['DNS-support']),
      // @ts-ignore
      vpnEcmpSupport: enableDisableProperty(tgwFeatures['VPN-ECMP-support']),
      // @ts-ignore
      defaultRouteTableAssociation: enableDisableProperty(tgwFeatures['Default-route-table-association']),
      // @ts-ignore
      defaultRouteTablePropagation: enableDisableProperty(tgwFeatures['Default-route-table-propagation']),
      // @ts-ignore
      autoAcceptSharedAttachments: enableDisableProperty(tgwFeatures['Auto-accept-sharing-attachments']),
      // @ts-ignore
      routeTables: tgwConfig["route-tables"]
    };
    if('asn' in tgwConfig)
      tgwProps['amazonSideAsn'] = tgwConfig.asn;
    return tgwProps as TransitGatewayProps;
  }
  
  
  function enableDisableProperty(feature: boolean){
    return feature? 'enable': 'disable'
  }

export class TransitGateway extends cdk.Construct{
    readonly tgw: string;
    readonly tgwRouteTables = new  Map<string, string>();
    constructor(parent: cdk.Construct, name: string, props: DeploymentConfig){
        super(parent, name);
        let tgwProps = prepareTransitGatewayProps(props);

        let tgwObject = new ec2.CfnTransitGateway(this, name, tgwProps);
        
        for( let routeTable of tgwProps.routeTables){
            let rt = new ec2.CfnTransitGatewayRouteTable(this, `${name}_tgw_${routeTable}`,{
                transitGatewayId: tgwObject.ref
            });
            this.tgwRouteTables.set(routeTable, rt.ref);
        }
        this.tgw = tgwObject.ref;
    }
}
