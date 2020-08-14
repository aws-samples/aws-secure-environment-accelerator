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
    cdk.Tag.add(this.resource, 'Name', `${props.name}_tgw`, { priority: 1000 });
  }

  get ref(): string {
    return this.resource.ref;
  }

  addRouteTable(name: string) {
    const index = this.routeTables.length;
    const routeTable = new ec2.CfnTransitGatewayRouteTable(this, `Route${index}`, {
      transitGatewayId: this.resource.ref,
    });
    cdk.Tag.add(routeTable, 'Name', `${this.props.name}_tgw_${name}_rt`, { priority: 1000 });

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
