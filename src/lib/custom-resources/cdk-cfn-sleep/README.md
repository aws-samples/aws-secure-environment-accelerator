# EC2 Image Finder

This is a custom resource that makes it possible to add a delay after resource creation.

## Usage

    import { CfnSleep } from '@aws-accelerator/custom-resource-cfn-sleep';

    const resource = ...

    const sleep = new CfnSleep(scope, 'Sleep', {
      sleep: 2000,
    });
    sleep.node.addDependency(resource);

    const dependency = ...
    dependency.node.addDependency(sleep);
