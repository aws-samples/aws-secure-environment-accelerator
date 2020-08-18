# Update Macie config

This is a custom resource to update Macie config from `UpdateOrganizationConfiguration` API call.

## Usage

    // turn on auto enable
    new MacieUpdateConfig(masterAccountStack, 'MacieUpdateConfig', {
      autoEnable: true,
    });

