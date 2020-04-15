import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';

export namespace LogArchive {
  export interface StackProps extends cdk.StackProps {
    centralLogRetentionInDays: number;
  }
  
  export class Stack extends cdk.Stack {
    readonly s3BucketArn: string;
    readonly s3KmsKeyArn: string;

    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      // bucket name format: pbmmaccel-{account #}-{region}
      const replBucketName = `pbmmaccel-${props.env?.account}-ca-central-1`;

      // s3 bucket to collect vpc-flow-logs
      const s3BucketForVpcFlowLogs = new s3.Bucket(this, 's3', {
        bucketName: replBucketName,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        versioned: true,
        encryption: s3.BucketEncryption.KMS,
        // Let the s3 to create KMS key
      });

      // Add alias to the created KMS key
      s3BucketForVpcFlowLogs.encryptionKey?.addAlias('PBMMAccel-Key');

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

      // store the s3 bucket arn for later reference
      this.s3BucketArn = s3BucketForVpcFlowLogs.bucketArn;

      // store the s3 bucket - kms key arn for later reference
      this.s3KmsKeyArn = s3BucketForVpcFlowLogs.encryptionKey?.keyArn ? s3BucketForVpcFlowLogs.encryptionKey?.keyArn : '';
    }
  }
}
