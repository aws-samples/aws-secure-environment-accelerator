import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export interface S3PutReplicationRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
}

export async function createS3PutReplicationRole(props: S3PutReplicationRoleProps): Promise<void> {
  const { accountStacks, accounts } = props;

  for (const account of accounts) {
    const accountStack = accountStacks.getOrCreateAccountStack(account.key);
    const iamRole = await createRole(accountStack);
    createIamRoleOutput(accountStack, iamRole, 'S3PutReplicationRole');
  }
}

async function createRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::S3PutReplicationRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'iam:PassRole',
        'logs:CreateLogStream',
        'logs:CreateLogGroup',
        'logs:PutLogEvents',
        's3:PutLifecycleConfiguration',
        's3:PutReplicationConfiguration',
        's3:PutBucketVersioning',
      ],
      resources: ['*'],
    }),
  );
  return role;
}
