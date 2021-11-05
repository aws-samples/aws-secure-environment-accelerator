# Put S3 Bucket Notifications

This is a custom resource to add notifications to S3 bucket.

## Usage

    import { S3BucketNotifications } from '@aws-accelerator/custom-resource-s3-bucket-notifications';

    new S3BucketNotifications(this, `S3BucketNotifications`, {
      bucketName: this.bucket.bucketName,
      queueArn: queueArn,
      s3Event: s3Event,
      s3EventName: eventName
    });
