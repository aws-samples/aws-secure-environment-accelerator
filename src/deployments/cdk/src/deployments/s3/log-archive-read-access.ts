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

import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { Account, getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { S3UpdateLogArchivePolicy } from '@aws-accelerator/custom-resource-s3-update-logarchive-policy';

export interface LogArchiveReadAccessProps {
  accountStacks: AccountStacks;
  accounts: Account[];
  logBucket: s3.IBucket;
  aesLogBucket: s3.IBucket;
  config: AcceleratorConfig;
  acceleratorPrefix: string;
}

export async function logArchiveReadOnlyAccess(props: LogArchiveReadAccessProps) {
  const { accountStacks, accounts, logBucket, aesLogBucket, config, acceleratorPrefix } = props;
  const logArchiveAccountKey = config['global-options']['central-log-services'].account;
  const logArchiveStack = accountStacks.getOrCreateAccountStack(logArchiveAccountKey);
  const logArchiveReadOnlyRoles = [];

  // Update Log Archive Bucket and KMS Key policies for roles with ssm-log-archive-read-only-access
  for (const { accountKey, iam: iamConfig } of config.getIamConfigs()) {
    const accountId = getAccountId(accounts, accountKey);
    const roles = iamConfig.roles || [];
    for (const role of roles) {
      if (role['ssm-log-archive-read-only-access']) {
        logArchiveReadOnlyRoles.push(`arn:aws:iam::${accountId}:role/${role.role}`);
      }
    }
  }

  const LogBucketPolicy = new S3UpdateLogArchivePolicy(logArchiveStack, 'UpdateLogArchivePolicy', {
    roles: logArchiveReadOnlyRoles,
    logBucket,
    aesLogBucket,
    acceleratorPrefix,
  });
}
