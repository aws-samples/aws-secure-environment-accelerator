import * as cdk from '@aws-cdk/core';
import { Keypair } from '@aws-accelerator/custom-resource-ec2-keypair';
import { createName, createSecretPrefix } from './accelerator-name-generator';

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

    const keyName = createName({
      name: props.name,
      suffixLength: 0,
    });
    const secretPrefix = createSecretPrefix('keypair/', 0);
    this.resource = new Keypair(this, 'Resource', {
      name: keyName,
      secretPrefix,
    });
  }

  get keyName(): string {
    return this.resource.keyName;
  }
}
