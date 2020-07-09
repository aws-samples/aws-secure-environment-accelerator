# Update Macie Export config

This is a custom resource to update Macie export config from `putClassificationExportConfiguration` API call.

## Usage

    regions.map(region => {
      const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey, region);
      // configure export S3 bucket
      new MacieExportConfig(masterAccountStack, 'MacieExportConfig', {
        bucketName: masterBucket.bucketName,
        keyPrefix: `${masterAccountId}/${region}/macie`,
        kmsKeyArn: masterBucket.encryptionKey?.keyArn,
      });
    });

