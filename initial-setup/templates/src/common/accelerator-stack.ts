import * as cdk from '@aws-cdk/core';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { Context } from '../utils/context';

export interface AcceleratorStackProps extends Omit<cdk.StackProps, 'env'> {
  context: Context;
  account: Account;
}

export class AcceleratorStack extends cdk.Stack {
  readonly context: Context;

  constructor(scope: cdk.Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, {
      ...props,
      env: {
        account: props.account.id,
      },
    });

    this.context = props.context;

    this.node.applyAspect(new cdk.Tag('Accelerator', props.context.environment.acceleratorName));
    this.node.applyAspect(new AcceleratorNameTagger());
  }
}
