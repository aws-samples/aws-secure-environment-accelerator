import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export interface TransitGatewayAttachmentProps {
  subnetIds: string[];
  transitGatewayId: string;
  vpcId: string;
  tgwRouteAssociates?: string[];
  tgwRoutePropagates?: string[];
  blackhole?: boolean;
  cidr?: string;
}

export class TransitGatewayAttachment extends cdk.Construct {
  public readonly tgwAttach: ec2.CfnTransitGatewayAttachment;
  constructor(parent: cdk.Construct, name: string, props: TransitGatewayAttachmentProps) {
    super(parent, name);

    this.tgwAttach = new ec2.CfnTransitGatewayAttachment(this, name, props);
    for (const [index, route] of props.tgwRouteAssociates?.entries() || []) {
      new ec2.CfnTransitGatewayRouteTableAssociation(this, `tgw_associate_${index}`, {
        transitGatewayAttachmentId: this.tgwAttach.ref,
        transitGatewayRouteTableId: route,
      });

      // some validation logic need to satisfy here: https://code.amazon.com/packages/AwsHubApiService/blobs/7817ec705ee0488995fc126c81c7cb86b82e2970/--/src/awshub/apiservice/validation/InputValidator.scala#L784
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
        transitGatewayAttachmentId: this.tgwAttach.ref,
        transitGatewayRouteTableId: route,
      });
    }
  }
}
