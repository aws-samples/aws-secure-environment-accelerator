# Directory Service Log Subscription

This is a custom resource to create a Directory Service log subscription using the `CreateLogSubscription` API call.

## Usage

    import { DirectoryServiceLogSubscription } from '@aws-accelerator/custom-resource-ds-log-subscription';

    const directory = ...;
    const logGroup = ...;

    new DirectoryServiceLogSubscription(this, 'DsLogSubscription', {
      directory,
      logGroup,
    });
