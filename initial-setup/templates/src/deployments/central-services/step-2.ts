import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import * as iam from '@aws-cdk/aws-iam';
import { Account, getAccountId } from '../../utils/accounts';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface CentralServicesStep2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
}

const LOG_PERMISSIONS = [
  {
    level: 'full',
    permissions: [
      'CloudWatchReadOnlyAccess',
      'CloudWatchAutomaticDashboardsAccess',
      'job-function/ViewOnlyAccess',
      'AWSXrayReadOnlyAccess',
    ],
  },
  {
    level: 'cwl+auto+xray',
    permissions: ['CloudWatchReadOnlyAccess', 'CloudWatchAutomaticDashboardsAccess', 'AWSXrayReadOnlyAccess'],
  },
  {
    level: 'cwl+auto',
    permissions: ['CloudWatchReadOnlyAccess', 'CloudWatchAutomaticDashboardsAccess'],
  },
];

/**
 * Enable Central Services Step 2
 * - Enable Cross Account Cross Region in monitoring accounts
 * - Share Data in Sub Accounts to Monitoring Accounts
 */
export async function step2(props: CentralServicesStep2Props) {
  const { accountStacks, config, accounts } = props;

  const centralSecurityServices = config['global-options']['central-security-services'];
  const centralOperationsServices = config['global-options']['central-operations-services'];
  const monitoringAccountKeys: string[] = [];
  if (centralSecurityServices && centralSecurityServices.cwl) {
    const securityStack = accountStacks.getOrCreateAccountStack(centralSecurityServices.account);
    monitoringAccountKeys.push(centralSecurityServices.account);
    await centralLoggingMonitoringEnable({
      scope: securityStack,
    });
  }

  if (centralOperationsServices && centralOperationsServices.cwl) {
    const operationsStack = accountStacks.getOrCreateAccountStack(centralOperationsServices.account);
    monitoringAccountKeys.push(centralOperationsServices.account);
    await centralLoggingMonitoringEnable({
      scope: operationsStack,
    });
  }

  if (monitoringAccountKeys.length === 0) {
    return;
  }
  const accessLevel =
    centralOperationsServices['cwl-access-level'] || centralSecurityServices['cwl-access-level'] || 'full';
  for (const account of accounts) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${account.key}`);
      continue;
    }

    const monitoringAccountIds = monitoringAccountKeys
      .filter(accountKey => accountKey !== account.key)
      .map(a => {
        return getAccountId(accounts, a)!;
      });
    await centralLoggingShareDataSettings({
      scope: accountStack,
      monitoringAccountIds,
      accessLevel,
    });
  }
}

/**
 * Central CloudWatch Services Settings in Sub Account
 */
async function centralLoggingMonitoringEnable(props: { scope: cdk.Construct }) {
  const { scope } = props;
  new iam.CfnServiceLinkedRole(scope, 'CloudWatch-CrossAccountSharingEnable', {
    awsServiceName: 'cloudwatch-crossaccount.amazonaws.com',
    description:
      'Allows CloudWatch to assume CloudWatch-CrossAccountSharing roles in remote accounts on behalf of the current account in order to display data cross-account, cross region ',
  });
}

/**
 * Share Cloud Watch Log Data settings in Sub Account to Monitoring Accounts
 */
async function centralLoggingShareDataSettings(props: {
  scope: cdk.Construct;
  monitoringAccountIds: string[];
  accessLevel: string;
}) {
  const { scope, monitoringAccountIds, accessLevel } = props;
  const accountPrincipals: iam.PrincipalBase[] = monitoringAccountIds.map(
    accountId => new iam.AccountPrincipal(accountId),
  );
  const logPermission = LOG_PERMISSIONS.find(lp => lp.level === accessLevel);
  if (!logPermission) {
    console.warn('Invalid Log Level Access given for CWL Central logging');
    return;
  }

  new iam.Role(scope, 'CloudWatch-CrossAccountDataSharingRole', {
    roleName: createRoleName('CWL-CrossAccountSharingRole'),
    assumedBy: new iam.CompositePrincipal(...accountPrincipals),
    managedPolicies: logPermission.permissions.map(permission =>
      iam.ManagedPolicy.fromAwsManagedPolicyName(permission),
    ),
  });
}
