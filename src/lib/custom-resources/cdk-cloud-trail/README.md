# Create CloudTrail Trail

This is a custom resource to create CloudTrail Trail in master account using the `CreateTrail` API call.

## Usage

    import { CreateCloudTrail } from '@aws-accelerator/custom-resource-cloud-trail';

    const cloudTrailName = ...;
    const bucketName = ...;
    const logGroupArn = ...;
    const roleArn = ...;
    const kmsKeyId = ...;
    const s3KeyPrefix = ...;
    const tagName = ...;
    const tagValue = ...;

    new CreateCloudTrail(this, 'CreateCloudTrail', {
      cloudTrailName,
      bucketName,
      logGroupArn,
      roleArn,
      kmsKeyId,
      s3KeyPrefix,
      tagName,
      tagValue,
    });
