# Add Subnets to Existing Transit Gateway Attachment

This is a custom resource to add Subnets to Existing Transit Gateway Attachment,  Used `describeTransitGatewayVpcAttachments` and `modifyTransitGatewayVpcAttachment` API calls.

## Usage

    import { ModifyTransitGatewayAttachment } from '@aws-accelerator/custom-resource-ec2-modify-transit-gateway-vpc-attachment';

    const modifyTgwAttach = new ModifyTransitGatewayAttachment(this, 'ModifyTgwAttach', {
      roleArn: ec2OpsRole.roleArn,
      subnetIds: currentSubnets,
      transitGatewayAttachmentId: tgwAttachment.transitGatewayAttachmentId,
      ignoreWhileDeleteSubnets: subnetIds,
    });
