import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import { DeploymentConfig } from '@aws-pbmm/common-lambda/lib/config';

function enableDisableProperty(feature: boolean | undefined): string {
  return feature ? 'enable' : 'disable';
}

export class TransitGateway extends cdk.Construct {
  readonly tgwId: string;
  readonly tgwRouteTableNameToIdMap = new Map<string, string>();

  constructor(parent: cdk.Construct, name: string, props: DeploymentConfig) {
    super(parent, name);

    // TODO Verify if features are mandatory
    const features = props.features;
    // TODO Remove the !! operator and verify if route tables are mandatory
    const routeTables = props['route-tables']!!;

    const tgwObject = new ec2.CfnTransitGateway(this, name, {
      dnsSupport: enableDisableProperty(features?.['DNS-support']),
      vpnEcmpSupport: enableDisableProperty(features?.['VPN-ECMP-support']),
      defaultRouteTableAssociation: enableDisableProperty(features?.['Default-route-table-association']),
      defaultRouteTablePropagation: enableDisableProperty(features?.['Default-route-table-propagation']),
      autoAcceptSharedAttachments: enableDisableProperty(features?.['Auto-accept-sharing-attachments']),
      amazonSideAsn: props.asn,
    });

    for (const routeTableName of routeTables) {
      const cfnRouteTable = new ec2.CfnTransitGatewayRouteTable(this, `${name}_tgw_${routeTableName}`, {
        transitGatewayId: tgwObject.ref,
      });
      this.tgwRouteTableNameToIdMap.set(routeTableName, cfnRouteTable.ref);
    }
    this.tgwId = tgwObject.ref;
  }
}
