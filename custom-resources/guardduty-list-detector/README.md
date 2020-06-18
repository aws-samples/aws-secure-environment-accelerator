# Retrieve Guard Duty detector id

This is a custom resource to retrieve Detector ID from `list-detectors` API call.

## Usage

    // Creating Guard Duty Master using detector id
    const detector = new GuardDutyDetector(masterAccountStack, 'GuardDutyDetector');

    const updateConfig = new GuardDutyUpdateConfig(masterAccountStack, 'GuardDutyUpdateConfig', {
      autoEnable: true,
      detectorId: detector.detectorId,
    });

