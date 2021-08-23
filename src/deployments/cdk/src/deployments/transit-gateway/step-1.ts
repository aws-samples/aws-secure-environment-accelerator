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

import {
  AcceleratorConfig,
  TransitGatewayAttachConfigType,
  TransitGatewayAttachConfig,
  FirewallAutoScaleConfigType,
} from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import { TransitGatewaySharing } from '../../common/transit-gateway-sharing';
import { TransitGateway } from '@aws-accelerator/cdk-constructs/src/vpc';
import { Account, getAccountId } from '../../utils/accounts';
import { CfnTransitGatewayOutput } from './outputs';

export interface TransitGatewayStep1Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
}

export async function step1(props: TransitGatewayStep1Props) {
  const { accountStacks, accounts, config } = props;

  const accountConfigs = config.getAccountConfigs();
  const vpcConfigs = config.getVpcConfigs();

  // Create a list of all transit gateway attachment configurations
  const attachConfigs: [string, TransitGatewayAttachConfig][] = [];
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const attachConfig = vpcConfig['tgw-attach'];
    if (TransitGatewayAttachConfigType.is(attachConfig) && attachConfig['associate-type'] === 'ATTACH') {
      attachConfigs.push([accountKey, attachConfig]);
    }
  }
  for (const [accountKey, accountConfig] of accountConfigs) {
    const firewalls = accountConfig.deployments?.firewalls;
    if (!firewalls || firewalls.length === 0) {
      continue;
    }
    for (const firewall of firewalls) {
      if (FirewallAutoScaleConfigType.is(firewall)) {
        continue;
      }
      const attachConfig = firewall['tgw-attach'];
      if (TransitGatewayAttachConfigType.is(attachConfig) && attachConfig['associate-type'] === 'ATTACH') {
        attachConfigs.push([accountKey, attachConfig]);
      }
    }
  }

  for (const [accountKey, accountConfig] of accountConfigs) {
    const tgwConfigs = accountConfig.deployments?.tgw;
    if (!tgwConfigs || tgwConfigs.length === 0) {
      continue;
    }

    for (const tgwConfig of tgwConfigs) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, tgwConfig.region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey} in region ${tgwConfig.region}`);
        continue;
      }

      const { features } = tgwConfig;
      const transitGateway = new TransitGateway(accountStack, `Tgw${tgwConfig.name}`, {
        name: tgwConfig.name,
        asn: tgwConfig.asn,
        dnsSupport: features?.['DNS-support'],
        vpnEcmpSupport: features?.['VPN-ECMP-support'],
        defaultRouteTableAssociation: features?.['Default-route-table-association'],
        defaultRouteTablePropagation: features?.['Default-route-table-propagation'],
        autoAcceptSharedAttachments: features?.['Auto-accept-sharing-attachments'],
      });

      const routeTables = tgwConfig['route-tables'] || [];
      for (const routeTableName of routeTables) {
        transitGateway.addRouteTable(routeTableName);
      }

      // Find the list of accounts where we need to share to
      const shareToAccountIds: string[] = [];
      for (const [attachAccountKey, attachConfig] of attachConfigs) {
        if (attachConfig.account === accountKey && attachConfig['associate-to-tgw'] === tgwConfig.name) {
          const accountId = getAccountId(accounts, attachAccountKey);
          if (accountId && accountId !== accountStack.accountId && !shareToAccountIds.includes(accountId)) {
            shareToAccountIds.push(accountId);
          }
        }
      }

      console.debug(`Sharing transit gateway ${tgwConfig.name} with accounts ${shareToAccountIds.join(', ')}`);

      if (shareToAccountIds.length > 0) {
        new TransitGatewaySharing(transitGateway, 'Sharing', {
          name: tgwConfig.name,
          tgwId: transitGateway.ref,
          principals: shareToAccountIds,
        });
      }

      // Save Transit Gateway Output
      new CfnTransitGatewayOutput(transitGateway, 'Output', {
        accountKey,
        region: tgwConfig.region,
        name: tgwConfig.name,
        tgwId: transitGateway.ref,
        tgwRouteTableNameToIdMap: transitGateway.tgwRouteTableNameToIdMap,
      });
    }
  }
}
