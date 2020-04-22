import * as cdk from '@aws-cdk/core';

import { AcceleratorStackProps, AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';

/**
 * Auxiliary construct that creates VPCs for mandatory accounts.
 */
export class DependentResources extends AcceleratorStack {
  constructor(scope: cdk.Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
  }
}
