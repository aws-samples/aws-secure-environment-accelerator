import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '../../utils/accounts';
import { createDefaultS3Bucket, createDefaultS3Key } from './shared';
import { CfnAccountBucketOutput, AccountBuckets } from './outputs';

export interface DefaultsStep2Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
  centralLogBucket: s3.IBucket;
}

export type DefaultsStep2Result = AccountBuckets;

export async function step2(props: DefaultsStep2Props): Promise<DefaultsStep2Result> {
  return createDefaultS3Buckets(props);
}

function createDefaultS3Buckets(props: DefaultsStep2Props) {
  const { accountStacks, accounts, centralLogBucket, config } = props;

  const buckets: { [accountKey: string]: s3.IBucket } = {};

  const logAccountKey = config['global-options']['central-log-services'].account;
  const logAccountId = getAccountId(accounts, logAccountKey)!;

  // We already created the log bucket in step 1
  buckets[logAccountKey] = centralLogBucket;

  // Next create all other buckets and use the log bucket to replicate into
  for (const [accountKey, _] of config.getAccountConfigs()) {
    if (buckets[accountKey]) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const key = createDefaultS3Key({
      accountStack,
    });

    const bucket = createDefaultS3Bucket({
      accountStack,
      config,
      encryptionKey: key,
    });
    bucket.replicateTo({
      destinationBucket: centralLogBucket,
      destinationAccountId: logAccountId,
      // Only replicate files under ACCOUNT_ID/
      prefix: `${cdk.Aws.ACCOUNT_ID}/`,
    });
    buckets[accountKey] = bucket;

    new CfnAccountBucketOutput(accountStack, 'DefaultBucketOutput', {
      bucketArn: bucket.bucketArn,
      bucketName: bucket.bucketName,
      encryptionKeyArn: bucket.encryptionKey!.keyArn,
      region: cdk.Aws.REGION,
    });
  }
  return buckets;
}
