import * as cdk from '@aws-cdk/core';
import { BucketProps, CfnBucket, CfnBucketProps } from '@aws-cdk/aws-s3';

export class S3 extends cdk.Construct {
  readonly s3BucketId: string;

  constructor(parent: cdk.Construct, name: string, props: BucketProps) {
    super(parent, name);

    const s3BucketName = props.bucketName ? props.bucketName : '';

    // TODO:
    const s3Bucket = new CfnBucket(this, s3BucketName, {
      bucketName: s3BucketName,
    });

    this.s3BucketId = s3Bucket.ref;
  }
}
