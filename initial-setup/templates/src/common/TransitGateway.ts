import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import { DeploymentConfig } from '@aws-pbmm/common-lambda/lib/config';

function prepareTransitGatewayProps(tgwConfig:DeploymentConfig): TransitGatewayProps{
    let tgwProps:any = {
      dnsSupport: enableDisableProperty(tgwConfig.features['DNS-support']),
      vpnEcmpSupport: enableDisableProperty(tgwConfig.features['VPN-ECMP-support']),
      defaultRouteTableAssociation: enableDisableProperty(tgwConfig.features['Default-route-table-association']),
      defaultRouteTablePropagation: enableDisableProperty(tgwConfig.features['Default-route-table-propagation']),
      autoAcceptSharedAttachments: enableDisableProperty(tgwConfig.features['Auto-accept-sharing-attachments']),
      routeTables: tgwConfig["route-tables"]
    };
    if('asn' in tgwConfig)
      tgwProps['amazonSideAsn'] = tgwConfig.asn;
    return tgwProps as TransitGatewayProps;
  }
  
  
  function enableDisableProperty(feature: boolean){
    return feature? 'enable': 'disable'
  }

  
export interface TransitGatewayProps {
    amazonSideAsn: number,
    autoAcceptSharedAttachments: string,
    defaultRouteTableAssociation: string,
    defaultRouteTablePropagation: string,
    dnsSupport: string,
    vpnEcmpSupport: string,
    routeTables: string[],
    tags?: any[]
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
