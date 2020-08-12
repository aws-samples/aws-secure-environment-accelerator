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
  const { accountStacks, accounts, config } = props;
  const accountRoles: { [accountKey: string]: iam.IRole } = {};
  for (const { accountKey, vpcConfig, ouKey } of config.getVpcConfigs()) {
    const vpcSharedTo = getVpcSharedAccountKeys(accounts, vpcConfig, ouKey);
    vpcSharedTo.push(accountKey);
    const accountKeys = Array.from(new Set(vpcSharedTo));
    for (const localAccountKey of accountKeys) {
      if (accountRoles[localAccountKey]) {
        continue;
      }
      const accountStack = accountStacks.tryGetOrCreateAccountStack(localAccountKey);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${localAccountKey}`);
        continue;
      }
      const ssmRole = await ssmCreateDocumentRole(accountStack);
      accountRoles[accountKey] = ssmRole;
      createIamRoleOutput(accountStack, ssmRole, 'SSMSessionManagerDocument');
    }
  }
}

export async function ssmCreateDocumentRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::SSMSessionManagerDocument', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['ssm:DescribeDocument', 'ssm:UpdateDocument', 'ssm:CreateDocument'],
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
