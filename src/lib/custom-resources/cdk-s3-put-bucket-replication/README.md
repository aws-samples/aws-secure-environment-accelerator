# Put S3 Bucket Replication

This is a custom resource to add replication to S3 bucket `putBucketReplication` and `deleteBucketReplication` API calls.

## Usage

    import { S3PutBucketReplication } from '@aws-accelerator/custom-resource-s3-put-bucket-replication';

    new S3PutBucketReplication(this, `PutS3BucketReplication`, {
      bucketName: this.bucket.bucketName,
      replicationRole: replicationRole.roleArn,
      roleArn: this.s3PutReplicationRole,
      rules: this.replicationRules,
    });
