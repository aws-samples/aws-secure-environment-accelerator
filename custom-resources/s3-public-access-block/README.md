# S3 Put Public Access Block

This is a custom resource that enables or disables public access for an entire account.

## Usage

    import { S3PublicAccessBlock } from '@custom-resources/s3-public-access-block';

    new S3PublicAccessBlock(this, 'PublicAccessBlock', {
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    });
