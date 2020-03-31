import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

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
    tgw: string;
    tgwRouteTables = new  Map<string, string>();
    constructor(parent: cdk.Construct, name: string, props: TransitGatewayProps){
        super(parent, name);

        let tgwObject = new ec2.CfnTransitGateway(this, name, props);
        
        for( let routeTable of props.routeTables){
            let rt = new ec2.CfnTransitGatewayRouteTable(this, `${name}_tgw_${routeTable}`,{
                transitGatewayId: tgwObject.ref
            });
            this.tgwRouteTables.set(routeTable, rt.ref);
        }
        this.tgw = tgwObject.ref;
    }
}
