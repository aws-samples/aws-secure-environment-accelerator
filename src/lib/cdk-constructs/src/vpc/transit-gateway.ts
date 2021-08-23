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

export interface TransitGatewayProps {
  name: string;
  asn?: number;
  dnsSupport?: boolean;
  vpnEcmpSupport?: boolean;
  defaultRouteTableAssociation?: boolean;
  defaultRouteTablePropagation?: boolean;
  autoAcceptSharedAttachments?: boolean;
}

export class TransitGateway extends cdk.Construct {
  readonly resource: ec2.CfnTransitGateway;
  readonly tgwRouteTableNameToIdMap: { [routeTableName: string]: string } = {};

  private readonly routeTables: ec2.CfnTransitGatewayRouteTable[] = [];

  constructor(parent: cdk.Construct, id: string, private readonly props: TransitGatewayProps) {
    super(parent, id);

    this.resource = new ec2.CfnTransitGateway(this, 'Resource', {
      dnsSupport: enableDisableProperty(props.dnsSupport ?? false),
      vpnEcmpSupport: enableDisableProperty(props.vpnEcmpSupport ?? false),
      defaultRouteTableAssociation: enableDisableProperty(props.defaultRouteTableAssociation ?? false),
      defaultRouteTablePropagation: enableDisableProperty(props.defaultRouteTablePropagation ?? false),
      autoAcceptSharedAttachments: enableDisableProperty(props.autoAcceptSharedAttachments ?? false),
      amazonSideAsn: props.asn,
    });
    cdk.Tags.of(this.resource).add('Name', `${props.name}_tgw`, { priority: 1000 });
  }

  get ref(): string {
    return this.resource.ref;
  }

  addRouteTable(name: string) {
    const index = this.routeTables.length;
    const routeTable = new ec2.CfnTransitGatewayRouteTable(this, `Route${index}`, {
      transitGatewayId: this.resource.ref,
    });
    cdk.Tags.of(routeTable).add('Name', `${this.props.name}_tgw_${name}_rt`, { priority: 1000 });

    this.routeTables.push(routeTable);
    this.tgwRouteTableNameToIdMap[name] = routeTable.ref;
  }

  getRouteTableIdByName(routeTableName: string): string {
    return this.tgwRouteTableNameToIdMap[routeTableName];
  }
}

function enableDisableProperty(feature: boolean): string {
  return feature ? 'enable' : 'disable';
}
