# Update Guard Duty Publish Config

This is a custom resource to update Guard Duty publish config from `UpdatePublishingDestination` API call.

## Usage

    // Update Guard Duty publish config using detector id
    const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey, region);
    const detector = new GuardDutyDetector(accountStack, 'GuardDutyPublishDetector');

    const updatePublish = new GuardDutyUpdatePublish(accountStack, 'GuardDutyPublish', {
      destinationId: destinationId,
      detectorId: detector.detectorId,
      destinationArn: logBucket.bucketArn,
      kmsKeyArn: logBucket.encryptionKey?.keyArn,
    });

