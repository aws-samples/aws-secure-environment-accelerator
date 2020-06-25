import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '../../utils/accounts';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { TransitGatewayRoute, TransitGatewayRouteProps } from '../../common/transit-gateway-attachment';

export interface TransitGatewayStep2Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
}

export async function step2(props: TransitGatewayStep2Props) {
  const tgwAttOutputs = getStackJsonOutput(props.outputs, {
    outputType: 'TgwAttachmentOutput',
  });
  const outputMap: { [accountKey: string]: TransitGatewayRouteProps[] } = {};
  for (const tgwAttOutput of tgwAttOutputs) {
    const accountKey = tgwAttOutput.accountName;
    const prop: TransitGatewayRouteProps = {
      tgwAttachmentId: tgwAttOutput.tgwAttachmentId,
      tgwRouteAssociates: tgwAttOutput.tgwRouteAssociates,
      tgwRoutePropagates: tgwAttOutput.tgwRoutePropagates,
      blackhole: tgwAttOutput.blackhole,
      cidr: tgwAttOutput.cidr,
    };
    if (outputMap[accountKey]) {
      outputMap[accountKey].push(prop);
    } else {
      outputMap[accountKey] = [prop];
    }
  }

  for (const [accountKey, accountConfig] of props.config.getAccountConfigs()) {
    const stack = props.accountStacks.getOrCreateAccountStack(accountKey);

    if (outputMap[accountKey]) {
      for (const tgwAttOutput of outputMap[accountKey]) {
        const tgwRoutes = new TransitGatewayRoute(stack, 'TgwRoute', tgwAttOutput);
      }
    }
  }
}
