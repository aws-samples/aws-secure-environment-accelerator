import * as cdk from '@aws-cdk/core';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { Context } from '../utils/context';
import { getAccountId } from '../utils/accounts';

export interface AcceleratorStackProps extends Omit<cdk.StackProps, 'env'> {
  context: Context;
  accountKey: string;
}

export class AcceleratorStack extends cdk.Stack {
  readonly context: Context;
  readonly accountKey: string;
  readonly accountId: string;

  constructor(scope: cdk.Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, {
      ...props,
      env: {
        account: getAccountId(props.context.accounts, props.accountKey),
        region: cdk.Aws.REGION,
      },
    });

    this.context = props.context;
    this.accountKey = props.accountKey;
    this.accountId = getAccountId(props.context.accounts, props.accountKey);

    this.node.applyAspect(new cdk.Tag('Accelerator', props.context.environment.acceleratorName));
    this.node.applyAspect(new AcceleratorNameTagger());
  }
}
