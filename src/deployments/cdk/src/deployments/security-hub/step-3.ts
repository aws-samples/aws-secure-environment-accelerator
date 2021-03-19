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
/**
 *
 * @param props
 * Disable SecurityHub Controls in all accounts all regions excluding security-hub-excl-regions
 * Disable based on "global-options/security-hub-frameworks/standards/[*]/controls-to-disable"
 */
export async function step3(props: SecurityHubStep3Props) {
  const { accounts, accountStacks, config, outputs } = props;
  const globalOptions = config['global-options'];
  if (!globalOptions['central-security-services']['security-hub']) {
    return;
  }
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

    const securityHubExclRegions = globalOptions['central-security-services']['security-hub-excl-regions'] || [];
    for (const region of regions) {
      if (securityHubExclRegions.includes(region)) {
        console.info(
          `Security Hub is disabled in region "${region}" based on global-options/security-hub-excl-regions'`,
        );
        continue;
      }
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
