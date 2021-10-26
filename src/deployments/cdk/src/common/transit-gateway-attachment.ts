/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

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
    cdk.Tags.of(this.resource).add('Name', props.name, { priority: 1000 });
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
