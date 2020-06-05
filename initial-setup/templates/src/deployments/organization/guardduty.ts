import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { GuardDutyMaster, GuardDutyMember } from '@aws-pbmm/common-cdk/lib/organization';
import { CfnMemberProps } from '@aws-cdk/aws-guardduty';
import { Account, getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';

export interface GuardDutyStepProps {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  detectorId: string;
}

/**
 * First send guard duty invites to all member accounts in the organization
 *
 * @param props accountStacks and config passed from phases
 */
export async function step1(props: GuardDutyStepProps) {
  const masterAccountKey = props.config.getMandatoryAccountKey('master');
  const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey);

  const memberProps: CfnMemberProps = [];

  for (const [accountKey, accountConfig] of props.config.getAccountConfigs()) {
    // only create member props so exclude master account
    if (accountKey !== masterAccountKey) {
      memberProps.push({
        email: accountConfig.email,
        memberId: getAccountId(props.accounts, accountKey),
        detectorId: props.detectorId, // set to empty will be auto generated
      });
    }
  }

  const guardDutyMaster = new GuardDutyMaster(masterAccountStack, 'GuardDutyMaster', {
    memberProps,
  });
}

/**
 * Second accept all invites from master account in the organization
 *
 * @param props accountStacks and config passed from phases
 */
export async function step2(props: GuardDutyStepProps) {
  const masterAccountKey = props.config.getMandatoryAccountKey('master');

  for (const [accountKey, accountConfig] of props.config.getAccountConfigs()) {
    // only accept invites for member account excluding master account
    if (accountKey !== masterAccountKey) {
      const memberStack = props.accountStacks.getOrCreateAccountStack(accountKey);

      const memberAccountId = getAccountId(props.accounts, masterAccountKey);
      if (memberAccountId) {
        new GuardDutyMember(memberStack, 'GuardDutyMember', {
          detectorId: props.detectorId,
          masterId: memberAccountId,
        });
      }
    }
  }
}
