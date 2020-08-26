# Accept Transit Gateway peering attachment

This is a custom resource to accept transit gateway peering attachment

## Usage

    import { TransitGatewayAcceptPeeringAttachment } from '@aws-accelerator/custom-resource-accept-tgw-peering-attachment';

    const transitGatewayAttachmentId = ...;
    const tagValue = ...;
    const roleArn = ...;

    new VpcDefaultSecurityGroup(this, 'VpcDefaultSecurityGroup', {
      transitGatewayAttachmentId,
      tagValue,
      roleArn,
    });
