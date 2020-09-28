import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { Account } from '../../utils/accounts';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { SsmIncreaseThroughput } from '@aws-accelerator/custom-resource-ssm-increase-throughput';

export interface SSMStep2Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
}

/**
 * Increasing SSM Parameter store throughput
 * @param props
 */
export async function step2(props: SSMStep2Props) {
  const { accountStacks, accounts, config, outputs } = props;
  const regions = config['global-options']['supported-regions'];
  for (const account of accounts) {
    const ssmUpdateRole = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: account.key,
      roleKey: 'SSMUpdateRole',
    });
    if (!ssmUpdateRole) {
      console.warn(`No role created for  "${account.key}"`);
      continue;
    }
    for (const region of regions) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key, region);
      if (!accountStack) {
        console.warn(`Unable to create Account Stak for Account "${account.key}" and Region "${region}"`);
        continue;
      }
      new SsmIncreaseThroughput(accountStack, 'UpdateSSMParameterStoreThroughput', {
        roleArn: ssmUpdateRole.roleArn,
      });
    }
  }
}
