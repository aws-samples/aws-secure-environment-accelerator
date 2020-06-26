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
  for (const [index, tgwAttOutput] of Object.entries(tgwAttOutputs)) {
    const accountKey = tgwAttOutput.accountKey;
    const region = tgwAttOutput.region;

    const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey, region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey} in region ${region}`);
      continue;
    }

    new TransitGatewayRoute(accountStack, `TgwRoute${index}`, {
      tgwAttachmentId: tgwAttOutput.tgwAttachmentId,
      tgwRouteAssociates: tgwAttOutput.tgwRouteAssociates,
      tgwRoutePropagates: tgwAttOutput.tgwRoutePropagates,
      blackhole: tgwAttOutput.blackhole,
      cidr: tgwAttOutput.cidr,
    });
  }
}
