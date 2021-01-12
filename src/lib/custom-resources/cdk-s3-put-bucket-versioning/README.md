# S3 Put Bucket Versioning

This is a custom resource that enables bucket versioning.

## Usage

    import { S3PublicAccessBlock } from '@aws-accelerator/custom-resource-s3-public-access-block';

    new S3PublicAccessBlock(this, 'PublicAccessBlock', {
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    });
