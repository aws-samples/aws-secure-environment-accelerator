import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';

export namespace LogArchive {
  // export interface StackProps extends cdk.StackProps {
  //   accountConfig: AccountConfig;
  // }

  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
      super(scope, id, props);

      // const accountProps = props.accountConfig;

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
        expiration: cdk.Duration.days(730),
        noncurrentVersionExpiration: cdk.Duration.days(730),
      };

      // attach life cycle policy to the s3 bucket
      s3BucketForVpcFlowLogs.addLifecycleRule(s3LifeCycleRule);
    }
  }
}
