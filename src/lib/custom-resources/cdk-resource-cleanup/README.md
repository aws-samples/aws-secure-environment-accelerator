# Custom resource to delete the following
# - Deletes s3 bucket policy in the account with the given bucket name

This is a custom resource to delete s3 bucket policy if exists using `deleteBucketPolicy` API call.

## Usage

    import { ResourceCleanup } from '@aws-accelerator/custom-resource-cleanup';

    new ResourceCleanup(accountStack, `ResourceCleanup`, {
      roleArn: `<string>`,
      bucketName?: `<string>`,
    });
