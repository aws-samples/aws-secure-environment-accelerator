# Image Finder

This is a custom resource to find an AMI by using the EC2 `DescribeImages` API call.

## Usage

    import { ImageFinder } from '@aws-pbmm/custom-resource-image-finder';

    const imageFinder = new ImageFinder(scope, 'ImageFinder', {
      imageOwner: '679593333241',
      imageName: 'FortiGate-VM64-AWS build*',
      imageVersion: `*6.2.3*`,
    });

## To-do

Use `pnpm` in the `prepare` script to install the Lambda dependencies. Installing this package inside a workspace will
already have `pnpm` running. We cannot call `pnpm install` from the `prepare` script as we're already running inside
`pnpm install`.
