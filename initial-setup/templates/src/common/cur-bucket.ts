import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { createEncryptionKeyName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface FlowLogBucketReplication {
  accountId: string;
  kmsKeyArn: string;
  bucketArn: string;
}

export interface CurBucketProps {
  s3BucketNameForCur: string;
  expirationInDays: number;
  replication?: FlowLogBucketReplication;
}

export class CurBucket extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: CurBucketProps) {
    super(scope, id);
    const { s3BucketNameForCur, expirationInDays, replication } = props;

    // TODO Below code and flowLogBucket code are almost similar. We need to reuse the code.
    // cost and usage report

    // kms key used for s3 bucket encryption
    const encryptionKey = new kms.Key(this, 'EncryptionKey', {
      alias: 'alias/' + createEncryptionKeyName('S3-Default'),
      description: 'PBMM - Key used to encrypt/decrypt S3 bucket by default',
    });

    let replicationRole: iam.Role | undefined;
    let replicationConfiguration: s3.CfnBucket.ReplicationConfigurationProperty | undefined;
    if (replication) {
      // Create a role that will be able to replicate to the log-archive bucket
      replicationRole = new iam.Role(this, 'ReplicationRole', {
        assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
      });

      // Allow the replication role to replicate objects to the log archive bucket
      replicationRole.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            's3:ReplicateObject',
            's3:ReplicateDelete',
            's3:ReplicateTags',
            's3:GetObjectVersionTagging',
            's3:ObjectOwnerOverrideToBucketOwner',
          ],
          resources: [replication.bucketArn, `${replication.bucketArn}/*`],
        }),
      );

      // Allow the replication role to encrypt using the log archive KMS key
      replicationRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['kms:Encrypt'],
          resources: [replication.kmsKeyArn],
        }),
      );

      // Grant access for the ReplicationRole to read and write
      encryptionKey.grantEncryptDecrypt(replicationRole);

      // This is the replication configuration that will be used for the S3 bucket
      replicationConfiguration = {
        role: replicationRole.roleArn,
        rules: [
          {
            id: 'PBMMAccel-s3-replication-rule-1',
            status: 'Enabled',
            prefix: '',
            sourceSelectionCriteria: {
              sseKmsEncryptedObjects: {
                status: 'Enabled',
              },
            },
            destination: {
              bucket: replication.bucketArn,
              account: replication.accountId,
              encryptionConfiguration: {
                replicaKmsKeyId: replication.kmsKeyArn,
              },
              storageClass: 'STANDARD',
              accessControlTranslation: {
                owner: 'Destination',
              },
            },
          },
        ],
      };
    }

    // s3 bucket to collect cost and usage reports
    const s3Bucket = new s3.CfnBucket(this, 's3BucketCfn', {
      bucketName: s3BucketNameForCur,
      publicAccessBlockConfiguration: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      versioningConfiguration: {
        status: 'Enabled',
      },
      bucketEncryption: {
        serverSideEncryptionConfiguration: [
          {
            serverSideEncryptionByDefault: {
              sseAlgorithm: 'aws:kms',
              kmsMasterKeyId: encryptionKey.keyId,
            },
          },
        ],
      },
      lifecycleConfiguration: {
        rules: [
          {
            id: 'PBMMAccel-s3-life-cycle-policy-rule-1',
            status: 'Enabled',
            abortIncompleteMultipartUpload: {
              daysAfterInitiation: 7,
            },
            expirationInDays,
            noncurrentVersionExpirationInDays: expirationInDays,
          },
        ],
      },
      replicationConfiguration,
    });

    const s3BucketPolicy = new s3.CfnBucketPolicy(this, 's3BucketConstruct', {
      bucket: s3Bucket.bucketName!,
      policyDocument: {
        Version: '2008-10-17',
        Statement: [
          {
            Sid: 'Allow billing reports to check bucket policy',
            Effect: 'Allow',
            Principal: {
              Service: 'billingreports.amazonaws.com',
            },
            Action: ['s3:GetBucketAcl', 's3:GetBucketPolicy'],
            Resource: `${s3Bucket.attrArn}`,
          },
          {
            Sid: 'Allow billing reports to add reports to bucket',
            Effect: 'Allow',
            Principal: {
              Service: 'billingreports.amazonaws.com',
            },
            Action: 's3:PutObject',
            Resource: `${s3Bucket.attrArn}/*`,
          },
        ],
      },
    });

    if (replication) {
      // Grant the replication role the actions to replicate the objects in the bucket
      replicationRole!.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            's3:GetObjectLegalHold',
            's3:GetObjectRetention',
            's3:GetObjectVersion',
            's3:GetObjectVersionAcl',
            's3:GetObjectVersionForReplication',
            's3:GetObjectVersionTagging',
            's3:GetReplicationConfiguration',
            's3:ListBucket',
            's3:ReplicateDelete',
            's3:ReplicateObject',
            's3:ReplicateTags',
          ],
          resources: [s3Bucket.attrArn, `${s3Bucket.attrArn}/*`],
        }),
      );
    }
  }
}
