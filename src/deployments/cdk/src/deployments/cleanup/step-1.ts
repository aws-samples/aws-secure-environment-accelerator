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
  });

  // Checking if cleanup got executed in any of the previous SM runs
  if (resourceCleanupOutput && resourceCleanupOutput.bucketPolicyCleanup) {
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
  for (const accountKey of Object.keys(accountBuckets)) {
    // There is no default bucket in Log Archive account instead we have central log bucket, so skip cleanup
    if (logArchiveAccount === accountKey) {
      console.log(`Skipping the deletion of LogArchive account bucket policy ${logArchiveAccount}`);
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
