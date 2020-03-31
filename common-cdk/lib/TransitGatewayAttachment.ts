import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';


export interface TransitGatewayAttachmentProps {
    subnetIds: string[],
    transitGatewayId: string,
    vpcId: string,
    tgwRouteAssociates?: string[],
    tgwRoutePropagates?: string[],
    tags?: any[]
}

export class TransitGatewayAttachment extends cdk.Construct{
    constructor(parent: cdk.Construct, name: string, props: TransitGatewayAttachmentProps){
        super(parent, name);
        const tgwAttach = new ec2.CfnTransitGatewayAttachment(this, name, props);
        for( let [index, route] of props.tgwRouteAssociates?props.tgwRouteAssociates.entries():[].entries()){
            new ec2.CfnTransitGatewayRouteTableAssociation(this, `tgw_associate_${index}`, {
                transitGatewayAttachmentId: tgwAttach.ref,
                transitGatewayRouteTableId: route
            });
        }

        for( let [index, route] of props.tgwRoutePropagates?props.tgwRoutePropagates.entries():[].entries()){
            new ec2.CfnTransitGatewayRouteTablePropagation(this, `tgw_propagate_${index}`, {
                transitGatewayAttachmentId: tgwAttach.ref,
                transitGatewayRouteTableId: route
            })
        }
        
    }
}
