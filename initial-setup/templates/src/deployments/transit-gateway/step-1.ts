import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { TransitGatewaySharing } from '../../common/transit-gateway-sharing';
import { Organizations } from '@custom-resources/organization';
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
      const tgw = new TransitGateway(accountStack, tgwDeployment.name, tgwDeployment);

      // Share TGW to the organization
      const org = new Organizations(accountStack, `${tgwDeployment.name}_org`);
      const tgwShare = new TransitGatewaySharing(accountStack, `Shared_${tgwDeployment.name}_org`, {
        name: tgwDeployment.name,
        region,
        accountId: getAccountId(props.accounts, accountKey) || accountStack.account,
        tgwId: tgw.tgwId,
        masterAccountId: props.masterAccountId,
        orgId: org.organizationId,
      });

      // Save Transit Gateway Output
      const tgwOutput = {
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
