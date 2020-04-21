import * as cdk from '@aws-cdk/core';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { FlowLogBucket, FlowLogBucketProps } from '../common/flow-log-bucket';

export interface VpcStackProps extends AcceleratorStackProps {
  flowLogBucket: FlowLogBucketProps;
}

/**
 * Auxiliary construct that keeps allows us to create a single flow log bucket per account.
 */
export class VpcStack extends AcceleratorStack {
  readonly props: VpcStackProps;

  private flowLogBucket: FlowLogBucket | undefined;

  constructor(scope: cdk.Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);
    this.props = props;
  }

  /**
   * Creates or gets the existing flow log bucket.
   */
  getOrCreateFlowLogBucket(): FlowLogBucket {
    if (!this.flowLogBucket) {
      this.flowLogBucket = new FlowLogBucket(this, 'FlowLogBucket', this.props.flowLogBucket);
    }
    return this.flowLogBucket;
  }
}
