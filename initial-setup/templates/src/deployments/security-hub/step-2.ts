import { Account } from '../../utils/accounts';
import * as config from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { SecurityHubStack } from './common';

export interface SecurityHubStep2Props {
  accounts: Account[];
  config: config.AcceleratorConfig;
  accountStacks: AccountStacks;
}

export function step2(props: SecurityHubStep2Props) {
  const { accounts, accountStacks, config } = props;
  const globalOptions = config['global-options'];
  const regions = globalOptions['supported-regions'];
  const securityAccountKey = config.getMandatoryAccountKey('central-security');
  const securityMasterAccount = accounts.find(a => a.key === securityAccountKey);

  for (const account of accounts) {
    if (account.id === securityMasterAccount?.id) {
      continue;
    }
    for (const region of regions) {
      const memberAccountStack = accountStacks.tryGetOrCreateAccountStack(account.key, region);
      if (!memberAccountStack) {
        console.warn(`Cannot find account stack ${account.key} in region ${region}`);
        continue;
      }
      new SecurityHubStack(memberAccountStack, `SecurityHubMember-${account.key}`, {
        account,
        standards: globalOptions['security-hub-frameworks'],
        masterAccountId: securityMasterAccount?.id,
      });
    }
  }
}
