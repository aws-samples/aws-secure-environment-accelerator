# Create Hosted Zone

This is a custom resource to Create Private Hosted Zone Used `createHostedZone`, `listHostedZonesByVPC`, and `deleteHostedZone` API calls.

## Usage

    import { CreateHostedZone } from '@aws-accelerator/custom-resource-create-hosted-zone';

    this._hostedZone = new CreateHostedZone(this, 'Phz', {
      domain: this._hostedZoneName,
      comment: `zzEndpoint - ${serviceName}`,
      region: vpcRegion,
      roleArn,
      vpcId,
    });
