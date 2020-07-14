# Update Macie session

This is a custom resource to update Macie session from `updateMacieSession` API call.

## Usage

    // update frequency based on config
    new MacieUpdateSession(accountStack, 'MacieUpdateSession', {
      findingPublishingFrequency,
      status: MacieStatus.ENABLED,
    });

