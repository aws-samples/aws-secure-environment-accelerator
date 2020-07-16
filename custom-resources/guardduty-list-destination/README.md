# Retrieve Guard Duty destination id

This is a custom resource to retrieve destination ID from `ListPublishingDestinations` API call.

## Usage

    // Creating Guard Duty Master using detector id
    const detector = new GuardDutyDetector(masterAccountStack, 'GuardDutyDetector');

    const updateConfig = new GuardDutyUpdateConfig(masterAccountStack, 'GuardDutyUpdateConfig', {
      autoEnable: true,
      detectorId: detector.detectorId,
    });

