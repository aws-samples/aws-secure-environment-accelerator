import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';

export interface IamSecurityHubRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
}

export async function createSecurityHubRoles(props: IamSecurityHubRoleProps): Promise<void> {
  const { accountStacks, accounts } = props;

  for (const account of accounts) {
    const accountStack = accountStacks.getOrCreateAccountStack(account.key);
    const securityHubRole = await createSecurityHubRole(accountStack);
    createIamRoleOutput(accountStack, securityHubRole, 'SecurityHubRole');
  }
}

export async function createSecurityHubRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::SecurityHubRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['securityhub:*'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}
