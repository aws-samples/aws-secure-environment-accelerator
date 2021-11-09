/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { ResourceCleanup } from '@aws-accelerator/custom-resource-cleanup';
import { AccountBucketOutputFinder } from '../defaults';
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

  const securityAccount = config['global-options']['central-security-services'].account;
  for (const account of accounts) {
    const accountBucket = AccountBucketOutputFinder.tryFindOneByName({
      outputs,
      accountKey: account.key,
    });
    if (!accountBucket) {
      continue;
    }

    // Skip deletion of Log Archive and Security account default bucket policy
    if (securityAccount === account.key) {
      console.log(`Skipping the deletion of bucket policy for account ${account.key}`);
      continue;
    }

    const cleanupRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: account.key,
      roleKey: 'ResourceCleanupRole',
    });
    if (!cleanupRoleOutput) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${account.key}`);
      continue;
    }

    new ResourceCleanup(accountStack, `BucketPolicyCleanup${account.key}`, {
      bucketName: accountBucket.bucketName,
      roleArn: cleanupRoleOutput.roleArn,
    });
  }
}
