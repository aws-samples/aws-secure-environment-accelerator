import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { ResourceCleanup } from '@aws-accelerator/custom-resource-cleanup';
import { AccountBucketOutput } from '../defaults';
import { Account } from '../../utils/accounts';

export interface VpcFlowLogsBucketPermissionsCleanupProps {
  accounts: Account[];
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 *
 *  Delete VPC FlowLogs default S3 bucket permissions
 *
 */
export async function step1(props: VpcFlowLogsBucketPermissionsCleanupProps) {
  const { accounts, accountStacks, config, outputs } = props;

  // Find the account default buckets in the outputs
  const accountBuckets = AccountBucketOutput.getAccountBuckets({
    accounts,
    accountStacks,
    config,
    outputs,
  });

  for (const accountKey of Object.keys(accountBuckets)) {
    const defaultBucket = accountBuckets[accountKey];
    console.log('default bucket', accountKey, defaultBucket.bucketName);
    const logArchiveAccount = config['global-options']['central-log-services'].account;

    if (logArchiveAccount === accountKey) {
      continue;
    }

    const cleanupRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'ResourceCleanupRole',
    });
    if (!cleanupRoleOutput) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }
    console.log('cleanup role output', accountKey, cleanupRoleOutput);

    new ResourceCleanup(accountStack, `S3BucketPolicyCleanup${accountKey}`, {
      bucketName: defaultBucket.bucketName,
      roleArn: cleanupRoleOutput.roleArn,
    });
  }
}
