import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
import * as iam from '@aws-cdk/aws-iam';

export interface AccountDefaultSettingsAssetsProps extends cdk.StackProps {
  dummy: string;
}

export class AccountDefaultSettingsAssets extends cdk.Construct {
  readonly kmsKeyIdForEbsDefaultEncryption: string;

  constructor(scope: cdk.Construct, id: string, props: AccountDefaultSettingsAssetsProps) {
    super(scope, id);
    // const { madDeploymentConfig, subnetInfo, password } = props;
    
    // kms key used for default EBS encryption
    const kmsKey = new kms.Key(this, 'EBS-EncryptionKey', {
      alias: 'alias/EBS-Default-key',
      description: 'PBMM - Key used to encrypt/decrypt EBS by default',
      policy: new iam.PolicyDocument({
        statements: [ new iam.PolicyStatement({
          sid: 'key-consolepolicy-3',
          effect: iam.Effect.ALLOW,
          principals: [new iam.AccountPrincipal(props.env?.account)],
          actions: ['kms:*'],
          resources: ['*'],
        })]
      }),
    });

    // save the kmsKeyArn for later use
    this.kmsKeyIdForEbsDefaultEncryption = kmsKey.keyId;
  }
}
