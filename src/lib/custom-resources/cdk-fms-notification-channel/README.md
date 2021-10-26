# Directory Service Log Subscription

This is a custom resource to create a Notification Channel for FMS using the `putNotificationChannel & deleteNotificationChannel` API call.

## Usage

    import { FMSNotificationChannel } from '@aws-accelerator/custom-resource-fms-notification-channel';

    new FMSNotificationChannel(accountStack, `FMSNotificationChannel-Security`, {
      roleArn: fmsRoleOutput.roleArn,
      snsRoleArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${fmsRole}`,
      topicArn: `arn:aws:sns:${cdk.Aws.REGION}:${centralLogAccountId}:${createSnsTopicName(fmsNotificationAlertLevel)}`,
    });
