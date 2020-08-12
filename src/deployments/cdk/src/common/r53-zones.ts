import * as cdk from '@aws-cdk/core';
import * as r53 from '@aws-cdk/aws-route53';

import { GlobalOptionsZonesConfig } from '@aws-accelerator/common-config/src';
import { DNS_LOGGING_LOG_GROUP_REGION } from '@aws-accelerator/common/src/util/constants';
import { AcceleratorStack } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { trimSpecialCharacters } from '@aws-accelerator/common-outputs/src/secrets';

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

    const stack = AcceleratorStack.of(this);

    const zoneConfig = props.zonesConfig;
    const publicHostedZoneProps = zoneConfig.names.public;
    const privateHostedZoneProps = zoneConfig.names.private;

    // Create Public Hosted Zones
    for (const domain of publicHostedZoneProps) {
      const logGroupName = createR53LogGroupName({
        acceleratorPrefix: stack.acceleratorPrefix,
        domain,
      });
      const logGroupArn = `arn:aws:logs:${DNS_LOGGING_LOG_GROUP_REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${logGroupName}`;

      const zone = new r53.CfnHostedZone(this, `${domain.replace('.', '-')}_pz`, {
        name: domain,
        hostedZoneConfig: {
          comment: `PHZ - ${domain}`,
        },
        queryLoggingConfig: {
          cloudWatchLogsLogGroupArn: logGroupArn,
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

export function createR53LogGroupName(props: { acceleratorPrefix: string; domain: string }) {
  const { acceleratorPrefix, domain } = props;
  const prefix = trimSpecialCharacters(acceleratorPrefix);
  return `/${prefix}/r53/${domain}`;
}
