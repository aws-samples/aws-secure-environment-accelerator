import * as cdk from '@aws-cdk/core';
import { Keypair } from '@aws-accelerator/custom-resource-ec2-keypair';
import { AcceleratorStack } from './accelerator-stack';
import { trimSpecialCharacters } from './utils';

export interface AcceleratorKeypairProps {
  name: string;
}

/**
 * Wrapper around Keypair that automatically adds the Accelerator prefix to the secret.
 */
export class AcceleratorKeypair extends cdk.Construct {
  private readonly resource: Keypair;

  constructor(scope: cdk.Construct, id: string, props: AcceleratorKeypairProps) {
    super(scope, id);

    const stack = AcceleratorStack.of(this);
    const prefix = trimSpecialCharacters(stack.acceleratorPrefix);
    this.resource = new Keypair(this, 'Resource', {
      name: `${prefix}-${props.name}`,
      secretPrefix: `${prefix}/keypair/`,
    });
  }

  get keyName(): string {
    return this.resource.keyName;
  }
}
