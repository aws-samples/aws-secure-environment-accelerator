import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { TransitGatewayAttachmentOutputFinder } from '@aws-pbmm/common-outputs/lib/transit-gateway';
import { AccountStacks } from '../../common/account-stacks';
import { Account } from '../../utils/accounts';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { TransitGatewayRoute } from '../../common/transit-gateway-attachment';

export interface TransitGatewayStep2Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  outputs: StackOutput[];
}

export async function step2(props: TransitGatewayStep2Props) {
  const { accountStacks, outputs } = props;
  const attachments = TransitGatewayAttachmentOutputFinder.findAll({
    outputs,
  });
  for (const [index, attachment] of Object.entries(attachments)) {
    const accountKey = attachment.accountKey;
    const region = attachment.region;

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey} in region ${region}`);
      continue;
    }

    new TransitGatewayRoute(accountStack, `TgwRoute${index}`, {
      tgwAttachmentId: attachment.tgwAttachmentId,
      tgwRouteAssociates: attachment.tgwRouteAssociates,
      tgwRoutePropagates: attachment.tgwRoutePropagates,
      blackhole: attachment.blackhole,
      cidr: attachment.cidr,
    });
  }
}
