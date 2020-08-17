import { Account } from '../../utils/accounts';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { SecurityHub } from '@aws-accelerator/cdk-constructs/src/security-hub';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export interface SecurityHubStep2Props {
  accounts: Account[];
  config: AcceleratorConfig;
  accountStacks: AccountStacks;
  outputs: StackOutput[];
}

export async function step2(props: SecurityHubStep2Props) {
  const { accounts, accountStacks, config, outputs } = props;
  const globalOptions = config['global-options'];
  const regions = globalOptions['supported-regions'];
  const securityAccountKey = config.getMandatoryAccountKey('central-security');
  const securityMasterAccount = accounts.find(a => a.key === securityAccountKey);

  for (const account of accounts) {
    if (account.id === securityMasterAccount?.id) {
      continue;
    }

    const securityHubRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: account.key,
      roleKey: 'SecurityHubRole',
    });
    if (!securityHubRoleOutput) {
      continue;
    }

    for (const region of regions) {
      const memberAccountStack = accountStacks.tryGetOrCreateAccountStack(account.key, region);
      if (!memberAccountStack) {
        console.warn(`Cannot find account stack ${account.key} in region ${region}`);
        continue;
      }
      new SecurityHub(memberAccountStack, `SecurityHubMember-${account.key}`, {
        account,
        standards: globalOptions['security-hub-frameworks'],
        masterAccountId: securityMasterAccount?.id,
        roleArn: securityHubRoleOutput.roleArn,
      });
    }
  }
}
