import * as cdk from '@aws-cdk/core';
import { GlobalOptionsZonesConfig, AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { Route53 } from '../common/r53';
import { Context } from '../utils/context';
import { StackOutputs } from '../utils/outputs';

export namespace GlobalOptions {
  export interface StackProps extends AcceleratorStackProps {
    acceleratorConfig: AcceleratorConfig;
    context: Context;
    outputs: StackOutputs;
  }

  export class Stack extends AcceleratorStack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);
      new Route53(this, 'DNSResolvers', props);
    }
  }
}
