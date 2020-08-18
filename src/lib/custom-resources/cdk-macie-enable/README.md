# Enable Macie for an account

This is a custom resource to enable Macie using `enableMacie` API call.

## Usage

    const enable = new MacieEnable(masterAccountStack, 'MacieEnable', {
      findingPublishingFrequency,
      status: MacieStatus.ENABLED,
    });

