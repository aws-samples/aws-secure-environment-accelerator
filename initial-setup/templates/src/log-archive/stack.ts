import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as kms from '@aws-cdk/aws-kms';

export namespace LogArchive {
  export interface StackProps extends cdk.StackProps {
    centralLogRetentionInDays: number;
    sharedNetWorkAccountId: string;
  }

  export class Stack extends cdk.Stack {
    readonly s3BucketArn: string;
    readonly s3KmsKeyArn: string;

    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      const s3KmsKey = new kms.Key(this, 's3KmsKey', {
        alias: 'PBMMAccel-Key',
        description: 'PBMM Accel - KMS Key used by s3',
        enableKeyRotation: false,
        enabled: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      // TODO list all account IDs here
      // add policy required for s3 replication to the KMS key
      s3KmsKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'Enable cross account encrypt access for S3 Cross Region Replication',
          effect: iam.Effect.ALLOW,
          principals: [new iam.AccountPrincipal(props.sharedNetWorkAccountId)],
          actions: ['kms:Encrypt'],
          resources: ['*'],
        }),
        true,
      );

      // bucket name format: pbmmaccel-{account #}-{region}
      const replBucketName = `pbmmaccel-${props.env?.account}-ca-central-1`;

      // s3 bucket to collect vpc-flow-logs
      const s3BucketForVpcFlowLogs = new s3.Bucket(this, 's3ReplicationBucket', {
        bucketName: replBucketName,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        versioned: true,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: s3KmsKey,
      });

      // life cycle rule attached to the flow-logs s3 bucket
      const s3LifeCycleRule: s3.LifecycleRule = {
        id: 'PBMMAccel-s3-life-cycle-policy-rule-1',
        enabled: true,
        abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        expiration: cdk.Duration.days(props.centralLogRetentionInDays),
        noncurrentVersionExpiration: cdk.Duration.days(props.centralLogRetentionInDays),
      };

      // attach life cycle policy to the s3 bucket
      s3BucketForVpcFlowLogs.addLifecycleRule(s3LifeCycleRule);

      // add policy required for s3 replication to the s3 bucket
      s3BucketForVpcFlowLogs.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'S3ReplicationPolicyStmt1',
          effect: iam.Effect.ALLOW,
          principals: [new iam.AccountPrincipal(props.sharedNetWorkAccountId)],
          actions: [
            's3:GetBucketVersioning',
            's3:PutBucketVersioning',
            's3:ReplicateObject',
            's3:ReplicateDelete',
            's3:ObjectOwnerOverrideToBucketOwner',
          ],
          resources: [s3BucketForVpcFlowLogs.bucketArn, s3BucketForVpcFlowLogs.bucketArn + '/*'],
        }),
      );

      // store the s3 bucket arn for later reference
      this.s3BucketArn = s3BucketForVpcFlowLogs.bucketArn;

      // store the s3 bucket - kms key arn for later reference
      this.s3KmsKeyArn = s3BucketForVpcFlowLogs.encryptionKey?.keyArn
        ? s3BucketForVpcFlowLogs.encryptionKey?.keyArn
        : '';
    }
  }
}
