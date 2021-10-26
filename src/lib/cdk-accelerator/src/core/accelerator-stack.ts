import * as cdk from '@aws-cdk/core';
import { AcceleratorNameTagger, AcceleratorProtectedTagger } from '.';

export interface AcceleratorStackProps extends cdk.StackProps {
  acceleratorName: string;
  acceleratorPrefix: string;
}

export class AcceleratorStack extends cdk.Stack {
  readonly acceleratorName: string;
  readonly acceleratorPrefix: string;

  constructor(scope: cdk.Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.acceleratorName = props.acceleratorName;
    this.acceleratorPrefix = props.acceleratorPrefix;

    // Add Stack level tags using this.tags, so that CDK won't add them to resource in CFN
    this.tags.setTag('AcceleratorName', this.acceleratorName);
    cdk.Aspects.of(this).add(new cdk.Tag('Accelerator', this.acceleratorName));
    cdk.Aspects.of(this).add(new AcceleratorNameTagger());
    cdk.Aspects.of(this).add(new AcceleratorProtectedTagger(this.acceleratorName));
  }

  static of(construct: cdk.IConstruct): AcceleratorStack {
    const parents = construct.node.scopes;
    const stack = parents.find((p: cdk.IConstruct): p is AcceleratorStack => p instanceof AcceleratorStack);
    if (!stack) {
      throw new Error(`The construct should only be used inside an AcceleratorStack`);
    }
    return stack;
  }
}
