import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { TransitGatewaySharing } from '../../common/transit-gateway-sharing';
import { TransitGateway } from '../../common/transit-gateway';
import { Account, getAccountId } from '../../utils/accounts';
import { JsonOutputValue } from '../../common/json-output';

export interface TransitGatewayStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  masterAccountId: string;
  accounts: Account[];
}

export async function step1(props: TransitGatewayStep1Props) {
  for (const [accountKey, accountConfig] of props.config.getAccountConfigs()) {
    const tgwDeployment = accountConfig.deployments?.tgw;
    if (!tgwDeployment) {
      continue;
    }

    const accountStack = props.accountStacks.tryGetOrCreateAccountStack(accountKey, tgwDeployment.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey} in region ${tgwDeployment.region}`);
      continue;
    }

    // Create TGW Before Creating VPC
    const accountNames = tgwDeployment['share-to-account'];
    const tgw = new TransitGateway(accountStack, `TGW_${tgwDeployment.name}`, tgwDeployment);

    // Share TGW to the principals provided
    const principals: string[] = [];
    for (const accountName of accountNames || []) {
      const principal = getAccountId(props.accounts, accountName);
      if (principal !== undefined) {
        principals.push(principal);
      }
    }

    if (principals.length > 0) {
      new TransitGatewaySharing(accountStack, `TGW_Shared_${tgwDeployment.name}`, {
        name: tgwDeployment.name,
        tgwId: tgw.tgwId,
        principals,
      });
    }

    // Save Transit Gateway Output
    const tgwOutput = {
      name: tgwDeployment.name,
      tgwId: tgw.tgwId,
      tgwRouteTableNameToIdMap: tgw.tgwRouteTableNameToIdMap,
    };
    new JsonOutputValue(tgw, `TgwOutput`, {
      type: 'TgwOutput',
      value: tgwOutput,
    });
  }
}
