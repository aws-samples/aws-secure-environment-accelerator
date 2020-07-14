# Update Guard Duty config

This is a custom resource to update Guard Duty config from `UpdateOrganizationConfiguration` API call.

## Usage

    // Update Guard Duty config using detector id
    const detector = new GuardDutyDetector(masterAccountStack, 'GuardDutyDetector');

    const updateConfig = new GuardDutyUpdateConfig(masterAccountStack, 'GuardDutyUpdateConfig', {
      autoEnable: true,
      detectorId: detector.detectorId,
    });

