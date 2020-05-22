import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as s3 from '@aws-cdk/aws-s3';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { S3CopyFiles } from '@custom-resources/s3-copy-files';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import {
  createEncryptionKeyName,
  createBucketName,
  createRoleName,
  createFixedBucketName,
} from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { AccountStacks } from '../../common/account-stacks';
import { StructuredOutput } from '../../common/structured-output';
import { AccountBucketOutput, AccountBucketOutputType, CentralBucketOutput, CentralBucketOutputType } from './outputs';
import { Account, getAccountId } from '../../utils/accounts';

export interface DefaultsStep1Props {
  acceleratorPrefix: string;
  acceleratorName: string;
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
}

export interface DefaultsStep1Result {
  centralBucketCopy: s3.Bucket;
  accountS3Buckets: { [accountKey: string]: s3.Bucket };
  accountEbsEncryptionKeys: { [accountKey: string]: kms.Key };
}

export async function step1(props: DefaultsStep1Props): Promise<DefaultsStep1Result> {
  const centralBucketCopy = await createCentralBucketCopy(props);
  const accountS3Buckets = await createDefaultS3Buckets(props);
  const accountEbsEncryptionKeys = await createDefaultEbsEncryptionKey(props);
  return {
    centralBucketCopy,
    accountS3Buckets,
    accountEbsEncryptionKeys,
  };
}

/**
 * Creates a bucket that contains copies of the files in the central bucket.
 */
async function createCentralBucketCopy(props: DefaultsStep1Props) {
  const { acceleratorPrefix, acceleratorName, accountStacks, accounts, config } = props;

  const masterAccountConfig = config['global-options']['aws-org-master'];
  const masterAccountId = getAccountId(accounts, masterAccountConfig.account);
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountConfig.account);

  const centralBucketName = config['global-options']['central-bucket'];
  const centralBucket = s3.Bucket.fromBucketAttributes(masterAccountStack, 'CentralBucket', {
    // TODO Get default encryption key
    bucketName: centralBucketName,
  });

  const encryptionKey = new kms.Key(masterAccountStack, 'CentralBucketKey', {
    alias: 'alias/' + createEncryptionKeyName('CentralBucket'),
    description: `${acceleratorName} - Key used to encrypt/decrypt the copy of central S3 bucket`,
  });

  const centralBucketCopy = new s3.Bucket(masterAccountStack, 'CentralBucketCopy', {
    bucketName: createFixedBucketName({
      acceleratorPrefix,
      account: masterAccountId,
      region: masterAccountConfig.region,
      name: 'central',
    }),
    encryptionKey,
    versioned: true,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  });

  // TODO Narrow down permissions
  const accountPrincipals = accounts.map(a => new iam.AccountPrincipal(a.id));

  // Give all accounts access to use this key for decryption
  encryptionKey.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['kms:Decrypt'],
      principals: accountPrincipals,
      resources: ['*'],
    }),
  );

  // Give all accounts access to get and list objects in this bucket
  centralBucketCopy.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:Get*', 's3:List*'],
      resources: [centralBucketCopy.bucketArn, centralBucketCopy.arnForObjects('*')],
      principals: accountPrincipals,
    }),
  );

  // Copy files from source to destination
  const copyFiles = new S3CopyFiles(masterAccountStack, 'CopyFiles', {
    roleName: createRoleName('S3CopyFiles'),
    sourceBucket: centralBucket,
    destinationBucket: centralBucketCopy,
  });
  copyFiles.node.addDependency(centralBucketCopy);

  new StructuredOutput<CentralBucketOutput>(masterAccountStack, 'CentralBucketCopyOutput', {
    type: CentralBucketOutputType,
    value: {
      bucketName: centralBucketCopy.bucketName,
      bucketArn: centralBucketCopy.bucketArn,
      region: cdk.Aws.REGION,
    },
  });

  return centralBucketCopy;
}

async function createDefaultS3Buckets(props: DefaultsStep1Props) {
  const { accountStacks, config } = props;

  const buckets: { [accountKey: string]: s3.Bucket } = {};
  // TODO Create log archive bucket first
  for (const [accountKey, _] of config.getAccountConfigs()) {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);

    // Be careful *NOT* to change the ID or name of the bucket
    const bucket = new s3.Bucket(accountStack, 'DefaultBucket', {
      // TODO Use createDefaultBucketName
      bucketName: createBucketName(),
    });
    buckets[accountKey] = bucket;

    // TODO Encryption key
    // TODO Add bucket permissions

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
