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
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '../../utils/accounts';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import {
  TransitGatewayOutputFinder,
  TransitGatewayPeeringAttachmentOutputFinder,
} from '@aws-accelerator/common-outputs/src/transit-gateway';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { TransitGatewayCreatePeeringAttachment } from '@aws-accelerator/custom-resource-create-tgw-peering-attachment';
import { TransitGatewayAcceptPeeringAttachment } from '@aws-accelerator/custom-resource-accept-tgw-peering-attachment';
import { CfnTransitGatewayPeeringAttachmentOutput } from './outputs';

export interface TransitGatewayPeeringProps {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
  outputs: StackOutput[];
}

export async function createPeeringAttachment(props: TransitGatewayPeeringProps) {
  const { accountStacks, accounts, config, outputs } = props;

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const tgwConfigs = accountConfig.deployments?.tgw;
    if (!tgwConfigs || tgwConfigs.length === 0) {
      continue;
    }

    for (const tgwConfig of tgwConfigs) {
      const tgwAttach = tgwConfig['tgw-attach'];
      if (!tgwAttach) {
        continue;
      }

      // Find TGW in outputs
      const tgwRequestorOutput = TransitGatewayOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        name: tgwConfig.name,
        region: tgwConfig.region,
      });
      if (!tgwRequestorOutput) {
        continue;
      }

      const tgwAcceptorOutput = TransitGatewayOutputFinder.tryFindOneByName({
        outputs,
        accountKey: tgwAttach.account,
        name: tgwAttach['associate-to-tgw'],
        region: tgwAttach.region,
      });
      if (!tgwAcceptorOutput) {
        continue;
      }

      const tgwCreatePeeringRoleOutput = IamRoleOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        roleKey: 'TgwCreatePeeringRole',
      });
      if (!tgwCreatePeeringRoleOutput) {
        continue;
      }

      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, tgwConfig.region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey} in region ${tgwConfig.region}`);
        continue;
      }

      const createPeeringAttachmentResource = new TransitGatewayCreatePeeringAttachment(
        accountStack,
        `CreatePeering${tgwConfig.name}`,
        {
          transitGatewayId: tgwRequestorOutput.tgwId,
          targetTransitGatewayId: tgwAcceptorOutput.tgwId,
          targetAccountId: getAccountId(accounts, tgwAttach.account)!,
          targetRegion: tgwAttach.region,
          tagValue: `${tgwConfig.name}_to${tgwAttach['associate-to-tgw']}_peer`,
          roleArn: tgwCreatePeeringRoleOutput.roleArn,
        },
      );

      new CfnTransitGatewayPeeringAttachmentOutput(accountStack, `TgwPeeringAttachmentOutput${tgwConfig.name}`, {
        tgwAttachmentId: createPeeringAttachmentResource.attachmentId,
        tagValue: `${tgwConfig.name}_to${tgwAttach['associate-to-tgw']}_peer`,
        sourceTgw: tgwConfig.name,
        tgws: [
          {
            name: tgwConfig.name,
            accountKey,
            region: tgwConfig.region,
            tgwId: tgwRequestorOutput.tgwId,
          },
          {
            name: tgwAttach['associate-to-tgw'],
            accountKey: tgwAttach.account,
            region: tgwAttach.region,
            tgwId: tgwAcceptorOutput.tgwId,
          },
        ],
      });
    }
  }
}

export async function acceptPeeringAttachment(props: TransitGatewayPeeringProps) {
  const { accountStacks, accounts, config, outputs } = props;

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const tgwConfigs = accountConfig.deployments?.tgw;
    if (!tgwConfigs || tgwConfigs.length === 0) {
      continue;
    }

    for (const tgwConfig of tgwConfigs) {
      const tgwPeeringAttachmentOutputs = TransitGatewayPeeringAttachmentOutputFinder.findAll({
        outputs,
      });

      const tgwPeeringAttachment = tgwPeeringAttachmentOutputs.find(output => {
        const tgwPeer = output.tgws.find(tgw => tgw.name === tgwConfig.name && tgw.region === tgwConfig.region);
        return !!tgwPeer;
      });
      if (
        !tgwPeeringAttachment ||
        !tgwPeeringAttachment.tgwAttachmentId ||
        tgwPeeringAttachment.sourceTgw === tgwConfig.name
      ) {
        continue;
      }

      const tgwAcceptPeeringRoleOutput = IamRoleOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        roleKey: 'TgwAcceptPeeringRole',
      });
      if (!tgwAcceptPeeringRoleOutput) {
        continue;
      }

      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, tgwConfig.region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey} in region ${tgwConfig.region}`);
        continue;
      }

      new TransitGatewayAcceptPeeringAttachment(accountStack, `AcceptSharing${tgwConfig.name}`, {
        transitGatewayAttachmentId: tgwPeeringAttachment.tgwAttachmentId,
        tagValue: tgwPeeringAttachment.tagValue,
        roleArn: tgwAcceptPeeringRoleOutput.roleArn,
      });
    }
  }
}
