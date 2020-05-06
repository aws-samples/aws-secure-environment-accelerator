import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as kms from '@aws-cdk/aws-kms';

export interface LogArchiveBucketProps {
  logRetention: cdk.Duration;
  logArchiveAccountId: string;
  accountIds: string[];
}

/**
 * Auxiliary construct that creates the flow log bucket and encryption key. It contains helper functions to share the
 * bucket and the key for replication.
 */
export class LogArchiveBucket extends cdk.Construct {
  readonly encryptionKey: kms.Key;
  readonly bucket: s3.Bucket;
  readonly principals: iam.IPrincipal[] = [];
  readonly logArchiveAccountId: string;
  readonly accountIds: string[] = [];

  constructor(scope: cdk.Construct, id: string, props: LogArchiveBucketProps) {
    super(scope, id);

    const { logRetention, logArchiveAccountId, accountIds } = props;
    this.logArchiveAccountId = logArchiveAccountId;
    this.accountIds = accountIds;

    this.encryptionKey = new kms.Key(this, 'EncryptionKey', {
      // alias: 'alias/S3-Default-key',
      description: 'PBMM Accel - KMS Key used by s3',
      enableKeyRotation: false,
      enabled: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // add policy required for cloud trail to use the KMS key
    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow CloudTrail access',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        actions: ['kms:DescribeKey'],
        resources: ['*'],
      }),
    );

    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Enable CloudTrail Encrypt Permissions',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        actions: ['kms:GenerateDataKey'],
        resources: ['*'],
        conditions: {
          StringLike: {
            'kms:EncryptionContext:aws:cloudtrail:arn': this.accountIds.map(x => `arn:aws:cloudtrail:*:${x}:trail/*`),
          },
        },
      }),
    );

    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Enable CloudTrail log decrypt permissions',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountPrincipal(this.logArchiveAccountId)],
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: {
          Null: {
            'kms:EncryptionContext:aws:cloudtrail:arn': false,
          },
        },
      }),
    );

    // bucket name format: pbmmaccel-{account #}-{region}
    const stack = cdk.Stack.of(this);
    const bucketName = `pbmmaccel-${stack.account}-${stack.region}`;

    // s3 bucket to collect vpc-flow-logs
    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.encryptionKey,
    });

    // life cycle rule attached to the flow-logs s3 bucket
    // attach life cycle policy to the s3 bucket
    this.bucket.addLifecycleRule({
      id: 'PBMMAccel-s3-life-cycle-policy-rule-1',
      enabled: true,
      abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
      expiration: logRetention,
      noncurrentVersionExpiration: logRetention,
    });
  }

  /**
   * Grant the necessary access to the given principal to replicate objects into this bucket.
   */
  grantReplicate(...principals: iam.IPrincipal[]) {
    this.principals.push(...principals);
  }

  get bucketArn(): string {
    return this.bucket.bucketArn;
  }

  get encryptionKeyArn(): string {
    return this.encryptionKey.keyArn;
  }

  protected onPrepare(): void {
    // add policy required for s3 replication to the KMS key
    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Enable cross account encrypt access for S3 Cross Region Replication',
        principals: this.principals,
        actions: ['kms:Encrypt'],
        resources: ['*'],
      }),
    );

    // add policy required for s3 replication to the s3 bucket
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: this.principals,
        actions: [
          's3:GetBucketVersioning',
          's3:PutBucketVersioning',
          's3:ReplicateObject',
          's3:ReplicateDelete',
          's3:ObjectOwnerOverrideToBucketOwner',
        ],
        resources: [this.bucket.bucketArn, this.bucket.arnForObjects('*')],
      }),
    );
  }
}
