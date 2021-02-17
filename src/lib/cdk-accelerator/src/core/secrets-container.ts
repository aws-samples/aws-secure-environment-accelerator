import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import { createEncryptionKeyName } from './accelerator-name-generator';

export interface SecretsContainerProps extends Omit<secrets.SecretProps, 'encryptionKey'> {
  /**
   * The name of the secret. It is mandatory to enable cross-account secret sharing.
   */
  secretName: string;
  /**
   * The actions to grant to the given principals.
   *
   * @default ['secretsmanager:GetSecretValue']
   */
  actions?: string[];
  /**
   * Principals to read access.
   */
  principals: iam.IPrincipal[];
}

/**
 * This is a utility class that manages cross-account secrets. It creates a KMS key that is used to encrypt secrets
 * and grants access to the secrets manager service.
 *
 * Secrets can be created using the `createSecret` function. This function create a secret in this stack and grants
 * the given principals decrypt access on the KMS key and access to retrieve the secret value.
 */
export class SecretsContainer extends cdk.Construct {
  readonly encryptionKey: kms.Key;
  readonly keyAlias: string;
  readonly principals: iam.IPrincipal[] = [];

  constructor(scope: cdk.Construct, name: string) {
    super(scope, name);

    this.keyAlias = createEncryptionKeyName(`Secrets-Key`);
    this.encryptionKey = new kms.Key(this, `EncryptionKey`, {
      alias: `alias/${this.keyAlias}`,
      description: 'Key used to encrypt/decrypt secrets',
      enableKeyRotation: true,
    });

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
  createSecret(id: string, props: SecretsContainerProps) {
    const secret = new secrets.Secret(this, id, {
      ...props,
      // The secret needs a physical name to enable cross account sharing
      encryptionKey: this.encryptionKey,
    });
    secret.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: props.actions ?? ['secretsmanager:GetSecretValue'],
        resources: ['*'],
        principals: props.principals,
      }),
    );
    // Keep track of the principals that need access so we can add them later to the key policy
    this.principals.push(...props.principals);
    return secret;
  }

  get alias() {
    return this.keyAlias;
  }

  protected onPrepare(): void {
    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'],
        principals: this.principals,
      }),
    );
  }
}
