# Retrieve Guard Duty detector id

This is a custom resource to retrieve Detector ID from `list-detectors` API call.

## Usage

    // Creating Guard Duty Master using detector id
    const guardDutyDetector = GuardDutyDetector(this, 'MemberDetector');

    new CfnMaster(this, `GuardDuty_Master_${props.masterId}`, {
      detectorId: guardDutyDetector.getDetectorId(),
      ...props
    });

