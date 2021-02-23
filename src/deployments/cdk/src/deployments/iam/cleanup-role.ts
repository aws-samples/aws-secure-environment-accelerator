import * as c from '@aws-accelerator/common-config/src';
import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export interface CleanupRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: c.AcceleratorConfig;
}

export async function createCleanupRoles(props: CleanupRoleProps): Promise<void> {
  const { accountStacks, accounts, config } = props;

  const logArchiveAccount = config['global-options']['central-log-services'].account;
  const securityAccount = config['global-options']['central-security-services'].account;
  for (const account of accounts) {
    // Added condition to skip creation of role in Log Archive and Security accounts
    if (logArchiveAccount === account.key || securityAccount === account.key) {
      console.log(`Skipping the creation of cleanup role for account ${account.key}`);
      continue;
    }
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
      actions: [
        'cloudFormation:DescribeStacks',
        'cloudFormation:DeleteStack',
        's3:HeadBucket',
        's3:PutBucketVersioning',
        's3:DeleteObjects',
        's3:ListBucketVersions',
        's3:DeleteBucket',
        's3:ListBucket',
        's3:DeleteObject',
        's3:DeleteObjectVersion',
        's3:PutLifecycleConfiguration',
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
