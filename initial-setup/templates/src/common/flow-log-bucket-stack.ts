import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { FlowLogBucket, FlowLogBucketProps } from './flow-log-bucket';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export type FlowLogContainerProps = FlowLogBucketProps;

/**
 * Auxiliary construct that keeps allows us to create a single flow log bucket per account.
 */
export class FlowLogContainer extends cdk.Construct {
  readonly props: FlowLogContainerProps;

  readonly bucket: FlowLogBucket;
  readonly role: iam.Role;

  constructor(scope: cdk.Construct, id: string, props: FlowLogContainerProps) {
    super(scope, id);
    this.props = props;
    this.bucket = new FlowLogBucket(this, 'FlowLogBucket', this.props);

    this.role = new iam.Role(this, 'Role', {
      roleName: createRoleName('VPC-FlowLog'),
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogDelivery', 'logs:DeleteLogDelivery'],
        resources: ['*'],
      }),
    );

    // Give the role access to the flow log bucket
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [this.bucket.bucketArn, `${this.bucket.bucketArn}/*`],
      }),
    );
  }
}
