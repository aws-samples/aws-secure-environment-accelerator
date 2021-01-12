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
  const masterAccountKey = config['global-options']['aws-org-master'].account;
  const centralLogBucket = accountBuckets[logAccountKey];
  const defaultLogRetention = config['global-options']['default-s3-retention'];
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

    const accountConfig = config.getAccountByKey(accountStack.accountKey);
    const logRetention = accountConfig['s3-retention'] ?? defaultLogRetention;

    const s3PutReplicationRole = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'S3PutReplicationRole',
    });

    if (!s3PutReplicationRole) {
      console.warn(`S3PutBucketReplication role is not created for account "${accountKey}"`);
      continue;
    }

    const versioning = new S3PutBucketVersioning(accountStack, `AccountBucket-PutBucketVersioning`, {
      bucketName: accountBucket.bucketName,
      logRetention,
      roleArn: s3PutReplicationRole.roleArn,
    });

    // Get IBucket object for enabling replication on it
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

  console.log(`Enabling Versioning for centralBucket "${masterAccountKey}"`);
  const accountStack = accountStacks.tryGetOrCreateAccountStack(masterAccountKey);
  if (!accountStack) {
    console.warn(`Cannot find account stack ${masterAccountKey}`);
    return;
  }

  const s3PutReplicationRoleMaster = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: masterAccountKey,
    roleKey: 'S3PutReplicationRole',
  });

  if (!s3PutReplicationRoleMaster) {
    console.warn(`S3PutBucketReplication role is not created for account "${masterAccountKey}"`);
    return;
  }

  const centralBucketVersioning = new S3PutBucketVersioning(accountStack, `CentralBucket-PutBucketVersioning`, {
    bucketName: centralBucket.bucketName,
    roleArn: s3PutReplicationRoleMaster.roleArn,
  });

  // Get IBucket object for enabling replication on it
  const centralBucketObj = new BucketReplication(accountStack, 'CentralBucketReplication', {
    bucket: centralBucket,
    s3PutReplicationRole: s3PutReplicationRoleMaster.roleArn,
  });
  centralBucketObj.node.addDependency(centralBucketVersioning);

  centralBucketObj.replicateTo({
    destinationBucket: centralLogBucket,
    destinationAccountId: getAccountId(accounts, logAccountKey)!,
    id: 'LogArchiveAccountBucket',
    // Only replicate files under ACCOUNT_ID/
    prefix: `${cdk.Aws.ACCOUNT_ID}/`,
  });
}
