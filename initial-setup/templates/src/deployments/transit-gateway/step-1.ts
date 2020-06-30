import {
  AcceleratorConfig,
  TransitGatewayAttachConfigType,
  TransitGatewayAttachConfig,
} from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { TransitGatewaySharing } from '../../common/transit-gateway-sharing';
import { TransitGateway } from '@aws-pbmm/constructs/lib/vpc';
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
    const attachConfig = accountConfig.deployments?.firewall?.['tgw-attach'];
    if (TransitGatewayAttachConfigType.is(attachConfig) && attachConfig['associate-type'] === 'ATTACH') {
      attachConfigs.push([accountKey, attachConfig]);
    }
  }

  for (const [accountKey, accountConfig] of accountConfigs) {
    const tgwConfig = accountConfig.deployments?.tgw;
    if (!tgwConfig) {
      continue;
    }

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
      autoAcceptSharedAttachments: true,
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
