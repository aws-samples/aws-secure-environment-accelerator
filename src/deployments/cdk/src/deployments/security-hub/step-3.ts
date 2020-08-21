import { Account } from '../../utils/accounts';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { SecurityHubDisableControls } from '@aws-accelerator/custom-resource-security-hub-disable-controls';

export interface SecurityHubStep3Props {
  accounts: Account[];
  config: AcceleratorConfig;
  accountStacks: AccountStacks;
  outputs: StackOutput[];
}

export async function step3(props: SecurityHubStep3Props) {
  const { accounts, accountStacks, config, outputs } = props;
  const globalOptions = config['global-options'];
  const regions = globalOptions['supported-regions'];

  for (const account of accounts) {
    const securityHubRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: account.key,
      roleKey: 'SecurityHubRole',
    });
    if (!securityHubRoleOutput) {
      continue;
    }

    for (const region of regions) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${account.key} in region ${region}`);
        continue;
      }

      new SecurityHubDisableControls(accountStack, `SecurityHubDisableControls-${account.key}`, {
        standards: globalOptions['security-hub-frameworks'].standards,
        roleArn: securityHubRoleOutput.roleArn,
      });
    }
  }
}
