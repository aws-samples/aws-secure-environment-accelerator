import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';

export interface KMSProps extends cdk.StackProps {
  alias: string;
  description: string;
  enableKeyRotation: boolean;
  enabled: boolean;
}

export class KMS extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: KMSProps) {
    super(scope, id);

    // TODO: confirm the key policies and trusted entities that needs to be attached
    const kmsKey = new kms.Key(this, props.alias, {
      alias: props.alias,
      description: props.description,
      enableKeyRotation: props.enableKeyRotation,
      enabled: props.enabled,
    });
  }
}
