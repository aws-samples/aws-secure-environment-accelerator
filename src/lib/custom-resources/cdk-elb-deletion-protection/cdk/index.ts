import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface ElbDeletionProtectionProps {
  loadBalancerName: string;
  loadBalancerArn: string;
}

/**
 * Custom resource implementation that Enables Deletion Protection on LoadBalancer.
 */
export class ElbDeletionProtection extends cdk.Construct {
  private readonly loadBalancerName: string;
  private readonly loadBalancerArn: string;

  constructor(scope: cdk.Construct, id: string, props: ElbDeletionProtectionProps) {
    super(scope, id);
    this.loadBalancerName = props.loadBalancerName;
    this.loadBalancerArn = props.loadBalancerArn;

    const physicalResourceId = custom.PhysicalResourceId.of(`${this.loadBalancerName}-DeletionProtection`);
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'ELBv2',
      action: 'modifyLoadBalancerAttributes',
      physicalResourceId,
      parameters: {
        LoadBalancerArn: this.loadBalancerArn,
        Attributes: [
          {
            Key: 'deletion_protection.enabled',
            Value: 'true',
          },
        ],
      },
    };

    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::ElbDeletionProtection',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      onDelete: {
        service: 'ELBv2',
        action: 'modifyLoadBalancerAttributes',
        physicalResourceId,
        parameters: {
          LoadBalancerArn: this.loadBalancerArn,
          Attributes: [
            {
              Key: 'deletion_protection.enabled',
              Value: 'false',
            },
          ],
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['elasticloadbalancing:ModifyLoadBalancerAttributes'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
