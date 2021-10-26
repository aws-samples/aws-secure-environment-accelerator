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

  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (!vpcConfig.zones) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while deploying Hosted Zones`);
      continue;
    }

    const publicHostedZones = vpcConfig.zones.public;
    const privateHostedZones = vpcConfig.zones.private;

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
        accountKey,
        domain,
        hostedZoneId: hostedZone.ref,
        region: vpcConfig.region,
        zoneType: 'PUBLIC',
        vpcName: undefined,
        serviceName: undefined,
      });
    }

    // Find the VPC in with the given name in the zones account
    const resolverVpc = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      vpcName: vpcConfig.name,
      region: vpcConfig.region,
    });
    if (!resolverVpc) {
      console.warn(`Cannot find resolver VPC with name "${vpcConfig.name}"`);
      continue;
    }

    // Form VPC Properties for Private Hosted Zone
    const vpcProps: r53.CfnHostedZone.VPCProperty = {
      vpcId: resolverVpc.vpcId,
      vpcRegion: vpcConfig.region,
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
        accountKey,
        domain,
        hostedZoneId: hostedZone.ref,
        region: vpcConfig.region,
        zoneType: 'PRIVATE',
        vpcName: vpcConfig.name,
        serviceName: undefined,
      });
    }
  }
}

export function createR53LogGroupName(props: { acceleratorPrefix: string; domain: string }) {
  const { acceleratorPrefix, domain } = props;
  const prefix = trimSpecialCharacters(acceleratorPrefix);
  return `/${prefix}/r53/${domain}`;
}
