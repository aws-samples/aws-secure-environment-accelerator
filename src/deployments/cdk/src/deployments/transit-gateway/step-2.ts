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

import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { TransitGatewayAttachmentOutputFinder } from '@aws-accelerator/common-outputs/src/transit-gateway';
import { AccountStacks } from '../../common/account-stacks';
import { Account } from '../../utils/accounts';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
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

    new TransitGatewayRoute(accountStack, `TgwRoute${attachment.constructIndex || index}`, {
      tgwAttachmentId: attachment.tgwAttachmentId,
      tgwRouteAssociates: attachment.tgwRouteAssociates,
      tgwRoutePropagates: attachment.tgwRoutePropagates,
      blackhole: attachment.blackhole,
      cidr: attachment.cidr,
    });
  }
}
