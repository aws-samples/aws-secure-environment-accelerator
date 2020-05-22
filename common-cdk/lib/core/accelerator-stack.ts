import * as cdk from '@aws-cdk/core';
import { AcceleratorNameTagger } from '.';

export interface AcceleratorStackProps extends Omit<cdk.StackProps, 'env'> {
  acceleratorName: string;
  acceleratorPrefix: string;
  accountId: string;
  accountKey: string;
}

export class AcceleratorStack extends cdk.Stack {
  readonly acceleratorName: string;
  readonly acceleratorPrefix: string;
  readonly accountId: string;
  readonly accountKey: string;

  constructor(scope: cdk.Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, {
      ...props,
      env: { account: props.accountId },
    });

    this.acceleratorName = props.acceleratorName;
    this.acceleratorPrefix = props.acceleratorPrefix;
    this.accountId = props.accountId;
    this.accountKey = props.accountKey;

    this.node.applyAspect(new cdk.Tag('Accelerator', this.acceleratorName));
    this.node.applyAspect(new AcceleratorNameTagger());
  }
}
