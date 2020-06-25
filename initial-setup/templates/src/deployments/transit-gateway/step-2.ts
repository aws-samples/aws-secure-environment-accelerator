import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '../../utils/accounts';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { TransitGatewayRoute } from '../../common/transit-gateway-attachment';

export interface TransitGatewayStep2Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
}

export async function step2(props: TransitGatewayStep2Props) {
  for (const { ouKey, accountKey, vpcConfig, deployments } of props.config.getVpcConfigs()) {
    const tgwAttOutputs = getStackJsonOutput(props.outputs, {
      accountKey,
      outputType: 'TgwAttachmentOutput',
    });

    const stack = props.accountStacks.getOrCreateAccountStack(accountKey);

    if (tgwAttOutputs.length > 0) {
      const tgwAttachment = tgwAttOutputs[0];
      const tgwRoutes = new TransitGatewayRoute(stack, 'TgwRoute', {
        tgwAttachmentId: tgwAttachment.tgwAttachmentId,
        tgwRouteAssociates: tgwAttachment.tgwRouteAssociates,
        tgwRoutePropagates: tgwAttachment.tgwRoutePropagates,
        blackhole: tgwAttachment.blackhole,
        cidr: tgwAttachment.cidrBlock,
      });
    }
    
  }
}