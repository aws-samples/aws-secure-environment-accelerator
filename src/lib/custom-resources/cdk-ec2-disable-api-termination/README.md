# EC2 Disable API Termination Protection

This is a custom resource to enable/disable disable-api-termination on EC2 instances using `ec2.modifyInstanceAttribute` API call.
It will be enabled on creation and disabled before delete. This is to make sure we can disable it before the accelerator
tries to delete the EC2 instance.

## Usage

    import { EC2DisableApiTermination } from '@aws-accelerator/custom-resource-ec2-disable-api-termination';

    new EC2DisableApiTermination(this, `DisableApiTermination`, {
      ec2Arn: this.resource.ref,
      ec2Name: this.props.name,
    });
