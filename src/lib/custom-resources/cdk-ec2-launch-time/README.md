# EC2 Instance launch time

This is a custom resource to get the ec2 instance launch time using the `DescribeInstances` API call.

## Usage

    import { InstanceLaunchTime } from '@aws-accelerator/custom-resource-ec2-launch-time';

    const InstanceId = ...;

    new InstanceLaunchTime(this, 'InstanceLaunchTime', {
      InstanceId,
    });
