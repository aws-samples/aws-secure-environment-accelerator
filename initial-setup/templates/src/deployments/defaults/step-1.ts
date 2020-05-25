import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as s3 from '@aws-cdk/aws-s3';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { S3CopyFiles } from '@custom-resources/s3-copy-files';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import {
  createEncryptionKeyName,
  createRoleName,
  createBucketName,
} from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { CentralBucketOutput, CentralBucketOutputType, LogBucketOutput, LogBucketOutputType } from './outputs';
import { AccountStacks } from '../../common/account-stacks';
import { Account } from '../../utils/accounts';
import { StructuredOutput } from '../../common/structured-output';
import { createDefaultS3Bucket } from './shared';

export interface DefaultsStep1Props {
  acceleratorPrefix: string;
  acceleratorName: string;
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
}

export interface DefaultsStep1Result {
  centralBucketCopy: s3.Bucket;
  centralLogBucket: s3.Bucket;
  accountEbsEncryptionKeys: { [accountKey: string]: kms.Key };
}

export async function step1(props: DefaultsStep1Props): Promise<DefaultsStep1Result> {
  const centralBucketCopy = createCentralBucketCopy(props);
  const centralLogBucket = createCentralLogBucket(props);
  const accountEbsEncryptionKeys = createDefaultEbsEncryptionKey(props);
  return {
    centralBucketCopy,
    centralLogBucket,
    accountEbsEncryptionKeys,
  };
}

/**
 * Creates a bucket that contains copies of the files in the central bucket.
 */
function createCentralBucketCopy(props: DefaultsStep1Props) {
  const { acceleratorName, accountStacks, accounts, config } = props;

  const masterAccountConfig = config['global-options']['aws-org-master'];
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountConfig.account);

  // Get the location of the original central bucket
  const centralBucketName = config['global-options']['central-bucket'];
  const centralBucket = s3.Bucket.fromBucketAttributes(masterAccountStack, 'CentralBucket', {
    bucketName: centralBucketName,
  });

  const encryptionKey = new kms.Key(masterAccountStack, 'CentralBucketKey', {
    alias: 'alias/' + createEncryptionKeyName('Central'),
    description: `${acceleratorName} - Key used to encrypt/decrypt the copy of central S3 bucket`,
  });

  const bucket = new s3.Bucket(masterAccountStack, 'CentralBucketCopy', {
    bucketName: createBucketName('central'),
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
  bucket.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:Get*', 's3:List*'],
      resources: [bucket.bucketArn, bucket.arnForObjects('*')],
      principals: accountPrincipals,
    }),
  );

  // Copy files from source to destination
  const copyFiles = new S3CopyFiles(masterAccountStack, 'CopyFiles', {
    roleName: createRoleName('S3CopyFiles'),
    sourceBucket: centralBucket,
    destinationBucket: bucket,
  });
  copyFiles.node.addDependency(bucket);

  new StructuredOutput<CentralBucketOutput>(masterAccountStack, 'CentralBucketOutput', {
    type: CentralBucketOutputType,
    value: {
      bucketArn: bucket.bucketArn,
      bucketName: bucket.bucketName,
      encryptionKeyArn: encryptionKey.keyArn,
    },
  });

  return bucket;
}

/**
 * Creates a bucket that contains copies of the files in the central bucket.
 */
function createCentralLogBucket(props: DefaultsStep1Props) {
  const { accountStacks, accounts, config } = props;

  const logAccountConfig = config['global-options']['central-log-services'];
  const logAccountStack = accountStacks.getOrCreateAccountStack(logAccountConfig.account);

  const logBucket = createDefaultS3Bucket({
    accountStack: logAccountStack,
    config,
  });

  // Allow replication from all Accelerator accounts
  logBucket.replicateFrom(accounts.map(account => account.id));

  new StructuredOutput<LogBucketOutput>(logAccountStack, 'LogBucketOutput', {
    type: LogBucketOutputType,
    value: {
      bucketArn: logBucket.bucketArn,
      bucketName: logBucket.bucketName,
      encryptionKeyArn: logBucket.encryptionKey!.keyArn,
    },
  });

  return logBucket;
}

function createDefaultEbsEncryptionKey(props: DefaultsStep1Props) {
  const { accountStacks, config, acceleratorName } = props;

  const accountEbsEncryptionKeys: { [accountKey: string]: kms.Key } = {};
  for (const [accountKey, _] of config.getAccountConfigs()) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    // Default EBS encryption key
    const key = new kms.Key(accountStack, 'EbsDefaultEncryptionKey', {
      alias: 'alias/' + createEncryptionKeyName('EBS-DefaultEncryption'),
      description: `${acceleratorName} - Key used to encrypt/decrypt EBS by default`,
    });

    key.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountPrincipal(cdk.Aws.ACCOUNT_ID)],
        actions: ['kms:*'],
        resources: ['*'],
      }),
    );

    accountEbsEncryptionKeys[accountKey] = key;

    // Save the output so it can be used in the state machine later
    // TODO Replace with custom resource
    new cdk.CfnOutput(accountStack, outputKeys.OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION, {
      value: key.keyId,
    });
  }
  return accountEbsEncryptionKeys;
}
