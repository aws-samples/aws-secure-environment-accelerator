import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as cdk from '@aws-cdk/core';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { trimSpecialCharacters } from '@aws-accelerator/common-outputs/src/secrets';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { DNS_LOGGING_LOG_GROUP_REGION } from '@aws-accelerator/common/src/util/constants';
import * as r53 from '@aws-cdk/aws-route53';
import { CfnHostedZoneOutput } from './outputs';

export interface CentralEndpointsStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  acceleratorPrefix: string;
}

/**
 *
 *  Create Hosted Zoens base on config from global-options/zones
 *  both public and private hosted zones
 */
export async function step1(props: CentralEndpointsStep1Props) {
  const { accountStacks, config, outputs, acceleratorPrefix } = props;
  const globalOptions = config['global-options'];
  const zoneConfig = globalOptions.zones.find(zone => zone.names);
  if (!zoneConfig) {
    console.warn(`No configuration found under global-options/zones with names (public and private Hosted Zones)`);
    return;
  }

  const accountStack = accountStacks.tryGetOrCreateAccountStack(zoneConfig.account, zoneConfig.region);
  if (!accountStack) {
    console.error(
      `Cannot find account stack ${zoneConfig.account}: ${zoneConfig.region}, while deploying Hosted Zones`,
    );
    return;
  }

  const publicHostedZones = zoneConfig.names.public;
  const privateHostedZones = zoneConfig.names.private;

  // Create Public Hosted Zones
  for (const domain of publicHostedZones) {
    const logGroupName = createR53LogGroupName({
      acceleratorPrefix,
      domain,
    });
    const logGroupArn = `arn:aws:logs:${DNS_LOGGING_LOG_GROUP_REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${logGroupName}`;
    const hostedZone = new r53.CfnHostedZone(accountStack, `${domain.replace('.', '-')}_pz`, {
      name: domain,
      hostedZoneConfig: {
        comment: `PHZ - ${domain}`,
      },
      queryLoggingConfig: {
        cloudWatchLogsLogGroupArn: logGroupArn,
      },
    });

    new CfnHostedZoneOutput(accountStack, `HostedZoneOutput-${domain.replace('.', '-')}`, {
      accountKey: zoneConfig.account,
      domain: domain,
      hostedZoneId: hostedZone.ref,
      region: zoneConfig.region,
      zoneType: 'PUBLIC',
      vpcName: undefined,
      serviceName: undefined,
    });
  }

  // Find the VPC in with the given name in the zones account
  const resolverVpc = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
    outputs,
    accountKey: zoneConfig.account,
    vpcName: zoneConfig['resolver-vpc'],
    region: zoneConfig.region,
  });
  if (!resolverVpc) {
    console.warn(`Cannot find resolver VPC with name "${zoneConfig['resolver-vpc']}"`);
    return;
  }

  // Form VPC Properties for Private Hosted Zone
  const vpcProps: r53.CfnHostedZone.VPCProperty = {
    vpcId: resolverVpc.vpcId,
    vpcRegion: zoneConfig.region,
  };

  // Create Private Hosted Zones
  for (const domain of privateHostedZones) {
    const hostedZone = new r53.CfnHostedZone(accountStack, `${domain.replace('.', '-')}_pz`, {
      name: domain,
      vpcs: [vpcProps],
      hostedZoneConfig: {
        comment: `PHZ - ${domain}`,
      },
    });

    new CfnHostedZoneOutput(accountStack, `HostedZoneOutput-${domain.replace('.', '-')}`, {
      accountKey: zoneConfig.account,
      domain: domain,
      hostedZoneId: hostedZone.ref,
      region: resolverVpc.region,
      zoneType: 'PRIVATE',
      vpcName: resolverVpc.vpcName,
      serviceName: undefined,
    });
  }
}

export function createR53LogGroupName(props: { acceleratorPrefix: string; domain: string }) {
  const { acceleratorPrefix, domain } = props;
  const prefix = trimSpecialCharacters(acceleratorPrefix);
  return `/${prefix}/r53/${domain}`;
}
