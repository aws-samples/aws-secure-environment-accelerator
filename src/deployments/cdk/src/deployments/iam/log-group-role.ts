import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export interface LogGroupRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
}

export async function createLogGroupRole(props: LogGroupRoleProps): Promise<void> {
  const { accountStacks, accounts } = props;

  for (const account of accounts) {
    const accountStack = accountStacks.getOrCreateAccountStack(account.key);
    const iamRole = await createRole(accountStack);
    createIamRoleOutput(accountStack, iamRole, 'LogGroupRole');
  }
}

async function createRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::LogsLogGroup', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:PutRetentionPolicy',
        'logs:DeleteRetentionPolicy',
        'logs:DescribeLogGroups',
        'logs:AssociateKmsKey',
      ],
      resources: ['*'],
    }),
  );
  return role;
}
