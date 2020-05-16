import * as cdk from '@aws-cdk/core';
import * as r53 from '@aws-cdk/aws-route53';

import { GlobalOptionsZonesConfig } from '@aws-pbmm/common-lambda/lib/config';

export interface Route53ZonesProps {
  zonesConfig: GlobalOptionsZonesConfig;
  vpcId: string;
  vpcRegion: string;
}

export class Route53Zones extends cdk.Construct {
  readonly publicZoneToDomainMap = new Map<string, string>();
  readonly privateZoneToDomainMap = new Map<string, string>();

  constructor(parent: cdk.Construct, name: string, props: Route53ZonesProps) {
    super(parent, name);

    const zoneConfig = props.zonesConfig;
    const publicHostedZoneProps = zoneConfig.names.public;
    const privateHostedZoneProps = zoneConfig.names.private;

    // Create Public Hosted Zones
    for (const domain of publicHostedZoneProps) {
      const zone = new r53.CfnHostedZone(this, `${domain.replace('.', '-')}_pz`, {
        name: domain,
        hostedZoneConfig: {
          comment: `PHZ - ${domain}`,
        },
      });
      this.publicZoneToDomainMap.set(domain, zone.ref);
    }

    // Form VPC Properties for Private Hosted Zone
    const vpcProps: r53.CfnHostedZone.VPCProperty = {
      vpcId: props.vpcId,
      vpcRegion: props.vpcRegion,
    };

    // Create Private Hosted Zones
    for (const domain of privateHostedZoneProps) {
      const zone = new r53.CfnHostedZone(this, `${domain.replace('.', '-')}_pz`, {
        name: domain,
        vpcs: [vpcProps],
        hostedZoneConfig: {
          comment: `PHZ - ${domain}`,
        },
      });
      this.privateZoneToDomainMap.set(domain, zone.ref);
    }
  }
}
