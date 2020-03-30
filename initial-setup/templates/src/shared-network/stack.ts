import * as cdk from '@aws-cdk/core';
import { VPC } from '../../../../common-cdk/lib/VPC'

export namespace SharedNetwork {
  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
      super(scope, id, props);
      new VPC(this, 'vpc', props);
    }
  }
}
