import { Account } from '../../utils/accounts';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { SecurityHub } from '@aws-accelerator/cdk-constructs/src/security-hub';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';

export interface SecurityHubStep1Props {
  accounts: Account[];
  config: AcceleratorConfig;
  accountStacks: AccountStacks;
  outputs: StackOutput[];
}

/**
 *
 * @param props
 * @returns
 *
 * Enables SecurityHub in Audit Account also send invites
 * to sub accounts in all regions excluding security-hub-excl-regions
 */
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

  const securityHubExclRegions = globalOptions['central-security-services']['security-hub-excl-regions'] || [];
  for (const region of regions) {
    if (securityHubExclRegions.includes(region)) {
      console.info(`Security Hub is disabled in region "${region}" based on global-options/security-hub-excl-regions'`);
      continue;
    }
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
