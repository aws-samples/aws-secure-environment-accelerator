import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyPair, KeyPairProps } from 'cdk-ec2-key-pair';

export type KeyPairStackProps = AcceleratorStackProps;

/**
 * This is a utility class that creates a stack to manage ec2 key pair. It creates a KMS key that is used to encrypt key pair
 * and grants access to the secrets manager service.
 *
 * Key pair can be created using the `createKeyPair` function. This function will create a key pair in this stack and grants
 * the given principals decrypt access on the KMS key and access to retrieve the secret value.
 */
export class KeyPairStack extends AcceleratorStack {
  readonly encryptionKey: kms.Key;
  readonly principals: iam.IPrincipal[] = [];

  constructor(scope: cdk.Construct, id: string, props: KeyPairStackProps) {
    super(scope, id, props);

    this.encryptionKey = new kms.Key(this, 'KeyPairEncryptionKey');
    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid:
          'Allow access through AWS Secrets Manager for all principals in the account that are authorized to use AWS Secrets Manager',
        effect: iam.Effect.ALLOW,
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:CreateGrant',
          'kms:DescribeKey',
        ],
        principals: [new iam.AnyPrincipal()],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `secretsmanager.${cdk.Aws.REGION}.amazonaws.com`,
            'kms:CallerAccount': cdk.Aws.ACCOUNT_ID,
          },
        },
      }),
    );
  }

  /**
   * Create a secret in the stack with the given ID and the given props.
   */
  createKeyPair(id: string, props: KeyPairProps, principal: iam.IPrincipal) {
    const keyPair = new KeyPair(this, 'RDGW-Key-Pair', {
      ...props,
      kms: this.encryptionKey,
    });

    const keyPairRole = new iam.Role(this, 'Key-pair-Role', {
      assumedBy: principal,
    });

    keyPair.grantRead(keyPairRole);

    this.principals.push(principal);
    // return keyPair;
  }

  protected onPrepare(): void {
    console.debug(`Adding decrypt access to secrets key for principals ${this.principals.join(', ')}`);

    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'],
        principals: this.principals,
      }),
    );
  }
}
