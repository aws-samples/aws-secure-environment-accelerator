import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { FlowLogBucket, FlowLogBucketProps } from './flow-log-bucket';

export type FlowLogContainerProps = FlowLogBucketProps;

/**
 * Auxiliary construct that keeps allows us to create a single flow log bucket per account.
 */
export class FlowLogContainer extends cdk.Construct {
  readonly props: FlowLogContainerProps;

  private bucket: FlowLogBucket | undefined;
  private role: iam.Role | undefined;

  constructor(scope: cdk.Construct, id: string, props: FlowLogContainerProps) {
    super(scope, id);
    this.props = props;
  }

  /**
   * Creates or gets the existing flow log bucket.
   */
  getOrCreateFlowLogBucket(): FlowLogBucket {
    if (!this.bucket) {
      this.bucket = new FlowLogBucket(this, 'FlowLogBucket', this.props);
    }
    return this.bucket;
  }

  /**
   * Creates or gets the existing flow log role.
   */
  getOrCreateFlowLogRole(): iam.Role {
    if (!this.role) {
      this.role = new iam.Role(this, 'Role', {
        assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
      });

      this.role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['logs:CreateLogDelivery', 'logs:DeleteLogDelivery'],
          resources: ['*'],
        }),
      );

      const bucket = this.getOrCreateFlowLogBucket();

      // Give the role access to the flow log bucket
      this.role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['s3:*'],
          resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
        }),
      );
    }
    return this.role;
  }
}
