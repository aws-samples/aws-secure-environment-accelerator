# EC2 Image Finder

This is a custom resource to find an AMI by using the EC2 `DescribeImages` API call.

## Usage

    import { ImageFinder } from '@aws-accelerator/custom-resource-ec2-image-finder';

    const imageFinder = new ImageFinder(scope, 'ImageFinder', {
      imageOwner: '679593333241',
      imageName: 'FortiGate-VM64-AWS build*',
      imageVersion: `*6.2.3*`,
    });
