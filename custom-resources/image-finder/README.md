# Image Finder

This is a custom resource to find an AMI by using the EC2 `DescribeImages` API call.

## Usage

    import { ImageFinder } from '@custom-resources/image-finder';

    const imageFinder = new ImageFinder(scope, 'ImageFinder', {
      imageOwner: '679593333241',
      imageName: 'FortiGate-VM64-AWS build*',
      imageVersion: `*6.2.3*`,
    });
