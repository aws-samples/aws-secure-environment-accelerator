# CloudWatch Central Logging to S3 bucket

This is a custom resource to create Subscription filters to all loggroups.
Uses `deleteSubscriptionFilter`, `describeLogGroups` and `putSubscriptionFilter` API calls.

## Usage

    ```
    import { CentralLoggingSubscriptionFilter } from '@custom-resources/logs-add-subscription-filter';

    new CentralLoggingSubscriptionFilter(accountStack, `LogGroups`, {
      logDestinationArn
    })
    ```