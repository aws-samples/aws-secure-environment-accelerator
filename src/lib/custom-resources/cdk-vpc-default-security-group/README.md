# VPC Default Security Group

This is a custom resource to delete the inbound and outbound rules of VPC default security group and attach tags to the default security group.

## Usage

    import { VpcDefaultSecurityGroup } from '@aws-accelerator/custom-resource-vpc-default-security-group';

    const vpcId = ...;
    const acceleratorName = ...;

    new VpcDefaultSecurityGroup(this, 'VpcDefaultSecurityGroup', {
      vpcId,
      acceleratorName,
    });
