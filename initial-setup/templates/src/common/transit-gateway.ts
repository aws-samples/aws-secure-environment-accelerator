import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import { TgwDeploymentConfig } from '@aws-pbmm/common-lambda/lib/config';

function enableDisableProperty(feature: boolean | undefined): string {
  return feature ? 'enable' : 'disable';
}

export class TransitGateway extends cdk.Construct {
  readonly tgw: ec2.CfnTransitGateway;
  readonly tgwRouteTableNameToIdMap: { [routeTableName: string]: ec2.CfnTransitGatewayRouteTable } = {};

  constructor(parent: cdk.Construct, name: string, props: TgwDeploymentConfig) {
    super(parent, name);

    const { features } = props;

    this.tgw = new ec2.CfnTransitGateway(this, name, {
      dnsSupport: enableDisableProperty(features?.['DNS-support']),
      vpnEcmpSupport: enableDisableProperty(features?.['VPN-ECMP-support']),
      defaultRouteTableAssociation: enableDisableProperty(features?.['Default-route-table-association']),
      defaultRouteTablePropagation: enableDisableProperty(features?.['Default-route-table-propagation']),
      autoAcceptSharedAttachments: enableDisableProperty(features?.['Auto-accept-sharing-attachments']),
      amazonSideAsn: props.asn,
    });

    const routeTables = props['route-tables'] || [];
    for (const routeTableName of routeTables) {
      const cfnRouteTable = new ec2.CfnTransitGatewayRouteTable(this, `${name}_tgw_${routeTableName}`, {
        transitGatewayId: this.tgw.ref,
      });
      this.tgwRouteTableNameToIdMap[routeTableName] = cfnRouteTable;
    }
  }

  get tgwId(): string {
    return this.tgw.ref;
  }

  getRouteTableByName(routeTableName: string): ec2.CfnTransitGatewayRouteTable | undefined {
    return this.tgwRouteTableNameToIdMap[routeTableName];
  }

  getRouteTableIdByName(routeTableName: string): string | undefined {
    return this.getRouteTableByName(routeTableName)?.ref;
  }
}
