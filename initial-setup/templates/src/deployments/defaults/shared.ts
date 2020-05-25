import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import { Bucket } from '@aws-pbmm/constructs/lib/s3';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { createEncryptionKeyName, createBucketName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { AccountStack } from '../../common/account-stacks';

/**
 * Creates a bucket in the account with given accountKey.
 */
export function createDefaultS3Bucket(props: { accountStack: AccountStack; config: AcceleratorConfig }): Bucket {
  const { accountStack, config } = props;

  const defaultLogRetention = config['global-options']['central-log-retention'];

  const accountConfig = config.getAccountByKey(accountStack.accountKey);
  const logRetention = accountConfig['log-retention'] ?? defaultLogRetention;

  const encryptionKey = new kms.Key(accountStack, 'DefaultKey', {
    alias: 'alias/' + createEncryptionKeyName('Default'),
    description: `Key used to encrypt/decrypt the copy of default S3 bucket`,
  });
  encryptionKey.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: 'Enable IAM User Permissions',
      principals: [new iam.AccountRootPrincipal()],
      actions: ['kms:*'],
      resources: ['*'],
    }),
  );

  // Generate fixed bucket name so we can do initialize cross-account bucket replication
  const bucket = new Bucket(accountStack, 'DefaultBucket', {
    bucketName: createBucketName(),
    encryptionKey,
    expirationInDays: logRetention,
  });

  bucket.encryptionKey?.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: 'Allow AWS services to use the encryption key',
      actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
      principals: [
        // TODO Isn't there a better way to grant to all AWS services through a condition?
        new iam.ServicePrincipal('ds.amazonaws.com'),
        new iam.ServicePrincipal('delivery.logs.amazonaws.com'),
      ],
      resources: ['*'],
    }),
  );

  return bucket;
}
