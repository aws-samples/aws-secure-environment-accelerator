import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export interface CleanupRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
}

export async function createCleanupRoles(props: CleanupRoleProps): Promise<void> {
  const { accountStacks, accounts } = props;

  for (const account of accounts) {
    const accountStack = accountStacks.getOrCreateAccountStack(account.key);
    const cleanupRole = await createResourceCleanupRole(accountStack);
    createIamRoleOutput(accountStack, cleanupRole, 'ResourceCleanupRole');
  }
}

export async function createResourceCleanupRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::ResourceCleanup', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['s3:DeleteBucketPolicy'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'route53resolver:ListResolverRules',
        'route53resolver:ListResolverRuleAssociations',
        'route53resolver:DisassociateResolverRule',
        'route53resolver:DeleteResolverRule',
        'ec2:DescribeVpcs',
      ],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['route53:ListHostedZonesByName', 'route53:DeleteHostedZone'],
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
