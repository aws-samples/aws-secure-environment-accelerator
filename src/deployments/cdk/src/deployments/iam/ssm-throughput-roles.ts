import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export interface CreateSsmThroughputRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
}

export async function createSsmThroughputRole(props: CreateSsmThroughputRoleProps): Promise<void> {
  const { accountStacks, accounts } = props;
  for (const account of accounts) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!accountStack) {
      console.warn(`Unable to create Account Stack for Account "${account.key}"`);
      continue;
    }
    const iamRole = await createRole(accountStack);
    createIamRoleOutput(accountStack, iamRole, 'SSMUpdateRole');
  }
}

async function createRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::SSMUpdateRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['ssm:GetServiceSetting'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['ssm:UpdateServiceSetting', 'ssm:ResetServiceSetting'],
      resources: [`arn:aws:ssm:*:${cdk.Aws.ACCOUNT_ID}:servicesetting/ssm/parameter-store/high-throughput-enabled`],
    }),
  );
  return role;
}
