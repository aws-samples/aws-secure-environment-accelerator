# Create Transit Gateway peering attachment

This is a custom resource to create transit gateway peering attachment

## Usage

    import { TransitGatewayCreatePeeringAttachment } from '@aws-accelerator/custom-resource-create-tgw-peering-attachment';

    const transitGatewayId = ...;
    const targetTransitGatewayId = ...;
    const targetAccountId = ...;
    const targetRegion = ...;
    const tagValue = ...;
    const roleArn = ...;

    new TransitGatewayCreatePeeringAttachment(this, 'CreateTransitGatewayPeeringAttachment', {
      transitGatewayId,
      targetTransitGatewayId,
      targetAccountId,
      targetRegion,
      tagValue,
      roleArn
    });
