# S3 Copy Files

This is a custom resource that copies files from a given source bucket to a given destination bucket.

## Usage

    import { S3CopyFiles } from '@custom-resources/s3-copy-files';

    const template = new S3CopyFiles(scope, 'Template', {
      sourceBucket: ...,
      destinationBucket: ...,
    });
