import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as s3 from '@aws-cdk/aws-s3';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { createEncryptionKeyName, createBucketName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { AccountStacks } from '../../common/account-stacks';
import { StructuredOutput } from '../../common/structured-output';
import { AccountBucketOutput, AccountBucketOutputType } from './outputs';

export interface DefaultsStep1Props {
  acceleratorName: string;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
}

export interface DefaultsStep1Result {
  accountS3Buckets: { [accountKey: string]: s3.Bucket };
  accountEbsEncryptionKeys: { [accountKey: string]: kms.Key };
}

export async function step1(props: DefaultsStep1Props): Promise<DefaultsStep1Result> {
  const accountS3Buckets = await createDefaultS3Buckets(props);
  const accountEbsEncryptionKeys = await createDefaultEbsEncryptionKey(props);
  return {
    accountS3Buckets,
    accountEbsEncryptionKeys,
  };
}

async function createDefaultS3Buckets(props: DefaultsStep1Props) {
  const { accountStacks, config } = props;

  // Turn on EBS default encryption for accounts with a VPC
  const buckets: { [accountKey: string]: s3.Bucket } = {};
  for (const [accountKey, _] of config.getAccountConfigs()) {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);

    // Default EBS encryption key
    // Be careful *NOT* to change the ID or name of the bucket
    const bucket = new s3.Bucket(accountStack, 'DefaultBucket', {
      bucketName: createBucketName(),
    });
    buckets[accountKey] = bucket;

    // TODO Add bucket permissions
    if (accountKey === 'log-archive') {
      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          principals: [new iam.AccountPrincipal('985666609251')],
          actions: ['s3:PutObject'],
          resources: [`${bucket.bucketArn}/*`],
        }),
      );

      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
          actions: ['s3:PutObject'],
          resources: [`${bucket.bucketArn}/*`],
          conditions: {
            StringEquals: {
              's3:x-amz-acl': 'bucket-owner-full-control',
            },
          },
        }),
      );

      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
          actions: ['s3:GetBucketAcl'],
          resources: [`${bucket.bucketArn}`],
        }),
      );
    }

    new StructuredOutput<AccountBucketOutput>(accountStack, 'DefaultBucketOutput', {
      type: AccountBucketOutputType,
      value: {
        bucketName: bucket.bucketName,
        bucketArn: bucket.bucketArn,
        region: cdk.Aws.REGION,
      },
    });
  }
  return buckets;
}

async function createDefaultEbsEncryptionKey(props: DefaultsStep1Props) {
  const { accountStacks, config, acceleratorName } = props;

  // Turn on EBS default encryption for accounts with a VPC
  const accountEbsEncryptionKeys: { [accountKey: string]: kms.Key } = {};
  for (const [accountKey, _] of config.getAccountConfigs()) {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);

    // Default EBS encryption key
    const key = new kms.Key(accountStack, 'EbsDefaultEncryptionKey', {
      alias: 'alias/' + createEncryptionKeyName('EBS-DefaultEncryption'),
      description: `${acceleratorName} - Key used to encrypt/decrypt EBS by default`,
    });

    key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'key-consolepolicy-3',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountPrincipal(cdk.Aws.ACCOUNT_ID)],
        actions: ['kms:*'],
        resources: ['*'],
      }),
    );

    accountEbsEncryptionKeys[accountKey] = key;

    // Save the output so it can be used in the state machine later
    new cdk.CfnOutput(accountStack, outputKeys.OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION, {
      value: key.keyId,
    });
  }
  return accountEbsEncryptionKeys;
}
