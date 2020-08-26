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
      console.log('tgwRequestorOutput', tgwRequestorOutput);
      if (!tgwRequestorOutput) {
        continue;
      }

      const tgwAcceptorOutput = TransitGatewayOutputFinder.tryFindOneByName({
        outputs,
        accountKey: tgwAttach.account,
        name: tgwAttach['associate-to-tgw'],
        region: tgwAttach.region,
      });
      console.log('tgwAcceptorOutput', tgwAcceptorOutput);
      if (!tgwAcceptorOutput) {
        continue;
      }

      const tgwCreatePeeringRoleOutput = IamRoleOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        roleKey: 'TgwCreatePeeringRole',
      });
      console.log('tgwCreatePeeringRoleOutput', tgwCreatePeeringRoleOutput);
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
        accountKey,
        region: tgwConfig.region,
        name: tgwConfig.name,
        tgwId: tgwRequestorOutput.tgwId,
        targetTgwName: tgwAttach['associate-to-tgw'],
        targetTgwId: tgwAcceptorOutput.tgwId,
        targetRegion: tgwAttach.region,
        tagValue: `${tgwConfig.name}_to${tgwAttach['associate-to-tgw']}_peer`,
        tgwAttachmentId: createPeeringAttachmentResource.attachmentId,
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

      const tgwPeeringAttachments = tgwPeeringAttachmentOutputs
        .flatMap(array => array)
        .filter(peer => peer.targetTgwName === tgwConfig.name && peer.targetRegion === tgwConfig.region);
      console.log('tgwPeeringAttachments', tgwPeeringAttachments);
      if (tgwPeeringAttachments.length === 0) {
        continue;
      }

      for (const tgwPeeringAttachment of tgwPeeringAttachments) {
        const tgwAcceptPeeringRoleOutput = IamRoleOutputFinder.tryFindOneByName({
          outputs,
          accountKey,
          roleKey: 'TgwAcceptPeeringRole',
        });
        console.log('tgwAcceptPeeringRoleOutput', tgwAcceptPeeringRoleOutput);
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
}
