import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { ResourceCleanup } from '@aws-accelerator/custom-resource-cleanup';
import { AccountBucketOutput } from '../defaults';
import { Account } from '../../utils/accounts';
import { ResourceCleanupOutputFinder } from './outputs';

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

  // Finding the output for previous resource cleanup execution
  const resourceCleanupOutput = ResourceCleanupOutputFinder.tryFindOneByName({
    outputs,
    bucketPolicyCleanup: true,
  });

  // Checking if cleanup got executed in any of the previous SM runs
  if (resourceCleanupOutput) {
    return;
  }

  // Find the account default buckets in the outputs
  const accountBuckets = AccountBucketOutput.getAccountBuckets({
    accounts,
    accountStacks,
    config,
    outputs,
  });

  const logArchiveAccount = config['global-options']['central-log-services'].account;
  const securityAccount = config['global-options']['central-security-services'].account;
  for (const accountKey of Object.keys(accountBuckets)) {
    // Skip deletion of Log Archive and Security account default bucket policy
    if (logArchiveAccount === accountKey || securityAccount === accountKey) {
      console.log(`Skipping the deletion of bucket policy for account ${accountKey}`);
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

    new ResourceCleanup(accountStack, `BucketPolicyCleanup${accountKey}`, {
      bucketName: accountBuckets[accountKey].bucketName,
      roleArn: cleanupRoleOutput.roleArn,
    });
  }
}
