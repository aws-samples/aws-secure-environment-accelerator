import { Account } from '../../utils/accounts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { SecurityHub } from '@aws-pbmm/constructs/lib/security-hub';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { IamRoleOutputFinder } from '@aws-pbmm/common-outputs/lib/iam-role';

export interface SecurityHubStep1Props {
  accounts: Account[];
  config: AcceleratorConfig;
  accountStacks: AccountStacks;
  outputs: StackOutput[];
}

export async function step1(props: SecurityHubStep1Props) {
  const { accounts, accountStacks, config, outputs } = props;
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

  const securityHubRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: securityAccountKey,
    roleKey: 'SecurityHubRole',
  });
  if (!securityHubRoleOutput) {
    return;
  }

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
        roleArn: securityHubRoleOutput.roleArn,
      });
    }
  }
}
