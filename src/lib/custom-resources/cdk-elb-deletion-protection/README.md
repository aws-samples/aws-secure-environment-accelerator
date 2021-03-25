# LoadBalancer Enable Deletion Protection

This is a custom resource to enable DeletionProtection on LoadBalancer using `elbv2.modifyLoadBalancerAttributes` API call.

## Usage

    import { ElbDeletionProtection } from '@aws-accelerator/custom-resource-elb-deletion-protection';

    new ElbDeletionProtection(this, 'DeletionProtection', {
      loadBalancerArn: <loadBalancerArn>,
      loadBalancerName: <loadBalancerName>,
    });