import { Account } from '../../utils/accounts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { SecurityHub } from '@aws-pbmm/constructs/lib/security-hub';

export interface SecurityHubStep1Props {
  accounts: Account[];
  config: AcceleratorConfig;
  accountStacks: AccountStacks;
}

export function step1(props: SecurityHubStep1Props) {
  const { accounts, accountStacks, config } = props;
  const globalOptions = config['global-options'];
  const regions = globalOptions['supported-regions'];
  const securityAccountKey = config.getMandatoryAccountKey('central-security');
  const securityMasterAccount = accounts.find(a => a.key === securityAccountKey);
  if (!securityMasterAccount) {
    console.log(`Did not find Security Account in Accelerator Accounts`);
    return;
  }
  const subAccountIds = accounts.map(account => ({
    AccountId: account.id,
    Email: account.email,
  }));
  for (const region of regions) {
    const securityMasterAccountStack = accountStacks.tryGetOrCreateAccountStack(securityAccountKey, region);
    if (!securityMasterAccountStack) {
      console.warn(`Cannot find security stack in region ${region}`);
    } else {
      // Create Security Hub stack for Master Account in Security Account
      new SecurityHub(securityMasterAccountStack, `SecurityHubMasterAccountSetup`, {
        account: securityMasterAccount,
        standards: globalOptions['security-hub-frameworks'],
        subAccountIds,
      });
    }
  }
}
