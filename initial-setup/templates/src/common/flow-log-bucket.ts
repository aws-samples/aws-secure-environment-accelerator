import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as s3 from '@aws-cdk/aws-s3';

export interface FlowLogBucketReplication {
  accountId: string;
  kmsKeyArn: string;
  bucketArn: string;
}

export interface FlowLogBucketProps {
  expirationInDays: number;
  replication?: FlowLogBucketReplication;
}

/**
 * Auxiliary bucket that allows replication of flow logs into another bucket.
 */
export class FlowLogBucket extends cdk.Construct {
  private bucket: s3.CfnBucket;

  constructor(scope: cdk.Construct, id: string, props: FlowLogBucketProps) {
    super(scope, id);

    const { expirationInDays, replication } = props;

    // bucket name format: pbmmaccel-{account #}-{region}
    const stack = cdk.Stack.of(this);
    const bucketName = undefined;
    // TODO Re-enable this
    // const bucketName = `pbmmaccel-${stack.account}-${stack.region}`;

    // kms key used for vpc-flow-logs s3 bucket encryption
    const encryptionKey = new kms.Key(this, 'EncryptionKey', {
      alias: 'alias/S3-Default-key',
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

    // s3 bucket to collect vpc-flow-logs
    this.bucket = new s3.CfnBucket(this, 'Bucket', {
      bucketName,
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
          resources: [this.bucket.attrArn, `${this.bucket.attrArn}/*`],
        }),
      );
    }
  }

  get bucketArn(): string {
    return this.bucket.attrArn;
  }
}
