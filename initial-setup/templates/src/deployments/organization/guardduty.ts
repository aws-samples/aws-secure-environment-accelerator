import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';
import { GuardDutyAdmin } from '@custom-resources/guardduty-enable-admin';
import { GuardDutyCreateMember } from '@custom-resources/guardduty-create-member';
import { GuardDutyDetector } from '@custom-resources/guardduty-list-detector';
import { GuardDutyUpdateConfig } from '@custom-resources/guardduty-update-config';

export interface GuardDutyStepProps {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
}

/**
 * Step 1 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 *
 * @param props accountStacks and config passed from phases
 */
export async function step1(props: GuardDutyStepProps) {
  const alzBaseline = props.config['global-options']['alz-baseline'];
  const enableGuardDuty = props.config['global-options']['central-security-services']['guard-duty'];

  // skipping Guardduty if using ALZ or not enabled from config
  if (alzBaseline || !enableGuardDuty) {
    return;
  }

  const masterAccountKey = props.config['global-options']['central-security-services'].account;
  const masterAccountId = getAccountId(props.accounts, masterAccountKey);
  const regions = props.config['global-options']['central-security-services']['guard-duty-regions'];
  regions?.map(region => {
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey, region);

    if (masterAccountId) {
      const admin = new GuardDutyAdmin(masterAccountStack, 'GuardDutyAdmin', {
        accountId: masterAccountId,
      });
    }
  });
}

/**
 * Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 * Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 *
 * @param props accountStacks and config passed from phases
 */
export async function step2(props: GuardDutyStepProps) {
  const alzBaseline = props.config['global-options']['alz-baseline'];
  const enableGuardDuty = props.config['global-options']['central-security-services']['guard-duty'];

  // skipping Guardduty if using ALZ or not enabled from config
  if (alzBaseline || !enableGuardDuty) {
    return;
  }

  const masterAccountKey = props.config['global-options']['central-security-services'].account;
  const regions = props.config['global-options']['central-security-services']['guard-duty-regions'];
  regions?.map(region => {
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey, region);

    const detector = new GuardDutyDetector(masterAccountStack, 'GuardDutyDetector');

    // Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
    const accountDetails = props.accounts.map(account => ({
      AccountId: account.id,
      Email: account.email,
    }));
    const members = new GuardDutyCreateMember(masterAccountStack, 'GuardDutyCreateMember', {
      accountDetails,
      detectorId: detector.detectorId,
    });

    // Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
    const updateConfig = new GuardDutyUpdateConfig(masterAccountStack, 'GuardDutyUpdateConfig', {
      autoEnable: true,
      detectorId: detector.detectorId,
    });
  });
}
