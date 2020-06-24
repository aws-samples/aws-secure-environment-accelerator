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
  for (const { ouKey, accountKey, vpcConfig, deployments } of props.config.getVpcConfigs()) {
    const region = vpcConfig.region;
    const accountStack = props.accountStacks.tryGetOrCreateAccountStack(accountKey, region);
    // Create TGW Before Creating VPC
    const tgwDeployment = deployments?.tgw;
    if (tgwDeployment && accountStack) {
      const accountNames = tgwDeployment['share-to-account'];
      const tgw = new TransitGateway(accountStack, tgwDeployment.name, tgwDeployment);

      // Share TGW to the organization
      const accountId = getAccountId(props.accounts, accountKey) || accountStack.account;
      if (accountNames) {
        const principals: string[] = [];
        for (const accountName of accountNames) {
          const principal = getAccountId(props.accounts, accountName);
          if (principal !== undefined) {
            principals.push(principal);
          }
        }
        const tgwShare = new TransitGatewaySharing(accountStack, `Shared_${tgwDeployment.name}_org`, {
          name: tgwDeployment.name,
          region,
          accountId,
          tgwId: tgw.tgwId,
          masterAccountId: props.masterAccountId,
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
}
