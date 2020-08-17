import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export interface TransitGatewayAttachmentProps {
  name: string;
  vpcId: string;
  subnetIds: string[];
  transitGatewayId: string;
}

export class TransitGatewayAttachment extends cdk.Construct {
  public readonly resource: ec2.CfnTransitGatewayAttachment;

  constructor(parent: cdk.Construct, name: string, props: TransitGatewayAttachmentProps) {
    super(parent, name);

    this.resource = new ec2.CfnTransitGatewayAttachment(this, 'Resource', props);
    cdk.Tag.add(this.resource, 'Name', props.name, { priority: 1000 });
  }

  get transitGatewayAttachmentId(): string {
    return this.resource.ref;
  }
}

export interface TransitGatewayRouteProps {
  tgwAttachmentId: string;
  tgwRouteAssociates?: string[];
  tgwRoutePropagates?: string[];
  blackhole?: boolean;
  cidr?: string;
}

export class TransitGatewayRoute extends cdk.Construct {
  constructor(parent: cdk.Construct, name: string, props: TransitGatewayRouteProps) {
    super(parent, name);

    for (const [index, route] of props.tgwRouteAssociates?.entries() || []) {
      new ec2.CfnTransitGatewayRouteTableAssociation(this, `tgw_associate_${index}`, {
        transitGatewayAttachmentId: props.tgwAttachmentId,
        transitGatewayRouteTableId: route,
      });

      if (props.blackhole) {
        new ec2.CfnTransitGatewayRoute(this, `tgw_tgw_route_${index}`, {
          transitGatewayRouteTableId: route,
          blackhole: props.blackhole,
          destinationCidrBlock: props.cidr,
        });
      }
    }

    for (const [index, route] of props.tgwRoutePropagates?.entries() || []) {
      new ec2.CfnTransitGatewayRouteTablePropagation(this, `tgw_propagate_${index}`, {
        transitGatewayAttachmentId: props.tgwAttachmentId,
        transitGatewayRouteTableId: route,
      });
    }
  }
}
