import * as cdk from '@aws-cdk/core';

import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '../../utils/accounts';
import { AccountBuckets, RegionalBucket } from './outputs';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { S3PutBucketVersioning } from '@aws-accelerator/custom-resource-s3-put-bucket-versioning';
import { BucketReplication } from '@aws-accelerator/cdk-constructs/src/s3';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export interface DefaultsStep3Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
  accountBuckets: AccountBuckets;
  centralBucket: RegionalBucket;
  outputs: StackOutput[];
}

export async function step3(props: DefaultsStep3Props) {
  const { config, accountBuckets, accountStacks, centralBucket, accounts, outputs } = props;
  const logAccountKey = config['global-options']['central-log-services'].account;
  const centralLogBucket = accountBuckets[logAccountKey];
  for (const [accountKey, accountBucket] of Object.entries(accountBuckets)) {
    if (accountKey === logAccountKey) {
      continue;
    }
    console.log(`Enabling Versioning for accountBucket "${accountKey}"`);
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const versioning = new S3PutBucketVersioning(accountStack, `AccountBucket-PutBucketVersioning`, {
      bucketName: accountBucket.bucketName,
    });

    const s3PutReplicationRole = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'S3PutReplicationRole',
    });

    if (!s3PutReplicationRole) {
      console.warn(`S3PutBucketReplication role is not created for account "${accountKey}"`);
      continue;
    }

    // Generate fixed bucket name so we can do initialize cross-account bucket replication
    const bucket = new BucketReplication(accountStack, 'DefaultBucketReplication', {
      bucket: accountBucket,
      s3PutReplicationRole: s3PutReplicationRole.roleArn,
    });
    bucket.node.addDependency(versioning);

    bucket.replicateTo({
      destinationBucket: centralLogBucket,
      destinationAccountId: getAccountId(accounts, logAccountKey)!,
      id: 'LogArchiveAccountBucket',
      // Only replicate files under ACCOUNT_ID/
      prefix: `${cdk.Aws.ACCOUNT_ID}/`,
    });
  }
}
