# Directory Service Log Subscription

This is a custom resource to create a Directory Service log subscription using the `CreateLogSubscription` API call.

## Usage

    import { DirectoryServiceLogSubscription } from '@custom-resources/ds-log-subscription';

    const directory = ...;
    const logGroup = ...;

    new DirectoryServiceLogSubscription(this, 'DsLogSubscription', {
      directory,
      logGroup,
    });
