import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { getVpcSharedAccountKeys } from '../../common/vpc-subnet-sharing';

export interface SSMDocumentProps {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
}

export async function createSSMDocumentRoles(props: SSMDocumentProps): Promise<void> {
  const { accountStacks, accounts } = props;
  const accountRoles: { [accountKey: string]: iam.IRole } = {};
  for (const account of accounts) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${account.key}`);
      continue;
    }
    const ssmRole = await ssmCreateDocumentRole(accountStack);
    accountRoles[account.key] = ssmRole;
    createIamRoleOutput(accountStack, ssmRole, 'SSMDocumentRole');
  }
}

export async function ssmCreateDocumentRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::CreateSSMDocument', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'ssm:DescribeDocument',
        'ssm:DeleteDocument',
        'ssm:UpdateDocumentDefaultVersion',
        'ssm:DescribeDocumentPermission',
        'ssm:UpdateDocument',
        'ssm:CreateDocument',
        'ssm:ModifyDocumentPermission',
        'ssm:GetDocument',
      ],
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
