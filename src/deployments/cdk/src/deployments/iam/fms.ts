import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import * as c from '@aws-accelerator/common-config';

export interface CreateFmsCustomResourceRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

export async function createFmsCustomResourceRole(props: CreateFmsCustomResourceRoleProps): Promise<void> {
  const { accountStacks, config } = props;
  const centralSecurityConfig = config['global-options']['central-security-services'];
  const accountStack = accountStacks.tryGetOrCreateAccountStack(centralSecurityConfig.account);
  if (!accountStack) {
    console.warn(`Unable to create Account Stack for Account "${centralSecurityConfig.account}"`);
    return;
  }
  const iamRole = await createRole(accountStack);
  createIamRoleOutput(accountStack, iamRole, 'FmsCustomResourceRole');
}

async function createRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::FmsCustomResourceRole', {
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
      actions: ['fms:PutNotificationChannel', 'fms:DeleteNotificationChannel', 'iam:PassRole'],
      resources: ['*'],
    }),
  );
  return role;
}
