# S3 Update LogArchive Policy

This is a custom resource to grant any roles with 'ssm-log-archive-read-only-access: true' read access to the Log Archive Bucket and its corresponding KMS key

## Usage

    import { S3UpdateLogArchivePolicy } from '@aws-accelerator/custom-resource-s3-update-logarchive-policy';

    new S3UpdateLogArchivePolicy(scope, `UpdateLogArchivePolicy`, {
      roles: string[],
      logBucket: s3.IBucket,
      removalPolicy?: cdk.RemovalPolicy;,
      acceleratorPrefix: string
    });
