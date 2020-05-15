import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '../../utils/accounts';
import * as iam from '@aws-cdk/aws-iam';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface CentralServicesStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
}

/**
 * Enable Central Services Step 1
 * - Enable Sharing Organization accounts list to monitoring accounts in master account.
 */
export async function step1(props: CentralServicesStep1Props) {
  const { accountStacks, config, accounts } = props;

  const globalOptions = config["global-options"];
  
  if (globalOptions) {
    await centralServicesSettingsInMaster({
      accountStacks,
      config: globalOptions,
      accounts
    });
  }
}

/**
 * Central Services Settings in Master Account
 */
async function centralServicesSettingsInMaster (props: {
  accountStacks: AccountStacks;
  config: c.GlobalOptionsConfig;
  accounts: Account[];
}) {
  const { accountStacks, config, accounts } = props;

  const accountIds: string[] = [];
  if (config["central-security-services"] && config["central-security-services"].cwl) {
    accountIds.push(getAccountId(accounts, config["central-security-services"].account));
  }
  if (config["central-operations-services"] && config["central-operations-services"].cwl) {
    accountIds.push(getAccountId(accounts, config["central-operations-services"].account));
  }
  if (config["central-log-services"] && config["central-log-services"].cwl) {
    accountIds.push(getAccountId(accounts, config["central-log-services"].account));
  }

  // Enable Cross-Account CloudWatch access in Master account fot sub accounts
  const accountStack = accountStacks.getOrCreateAccountStack('master');
  await cloudWatchSettingsInMaster({
    scope: accountStack, 
    accountIds,
  });
}

/**
 * Cloud Watch Cross Account Settings in Master Account
 */
async function cloudWatchSettingsInMaster (props: {
  scope: cdk.Construct;
  accountIds: string[];
}) {
  const { scope, accountIds } = props;
  const accountPrincipals: iam.PrincipalBase[] = accountIds.map(
    accountId => {
      return new iam.AccountPrincipal(accountId)
    }
  );
  const cloudWatchCrossAccountSharingRole = new iam.Role(scope, 'CloudWatch-CrossAccountSharing', {
    roleName: 'CloudWatch-CrossAccountSharing-ListAccountsRole',
    assumedBy: new iam.CompositePrincipal(...accountPrincipals),
  });
  cloudWatchCrossAccountSharingRole.addToPolicy(
    new iam.PolicyStatement({
      resources: ['*'],
      actions: ['organizations:ListAccounts', 'organizations:ListAccountsForParent'],
    }),
  );
}