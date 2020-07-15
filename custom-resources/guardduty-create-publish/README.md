# Create Guard Duty Publish Config

This is a custom resource to create Guard Duty publish config from `CreatePublishingDestination` API call.

## Usage

    // Create Guard Duty publish config using detector id
    const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey, region);
    const detector = new GuardDutyDetector(accountStack, 'GuardDutyPublishDetector');

    const createPublish = new GuardDutyCreatePublish(accountStack, 'GuardDutyPublish', {
      detectorId: detector.detectorId,
      destinationArn: logBucket.bucketArn,
      kmsKeyArn: logBucket.encryptionKey?.keyArn,
    });

