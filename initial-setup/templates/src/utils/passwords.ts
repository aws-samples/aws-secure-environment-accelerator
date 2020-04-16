import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import { generatePasswordSecret } from '@aws-pbmm/common-lambda/lib/util/password';

export interface GetPasswordProps {
  cdkStack: cdk.Stack;
  cdkId: string;
  passwordsKmsKeyArn: string;
  secretName: string;
  roleArns: string[];
}

/**
 * This function generates a password and stores it in the secrets manager with the given `secretName`. The secret
 * uses the given `passwordsKmsKeyArn` and it is shared with the given `roleArns`.
 */
export async function generatePassword(props: GetPasswordProps): Promise<cdk.SecretValue> {
  const { cdkStack, cdkId, passwordsKmsKeyArn, secretName, roleArns } = props;

  const password = await generatePasswordSecret({
    secretName,
    kmsKeyId: passwordsKmsKeyArn,
    roleArns,
  });

  const secret = secrets.Secret.fromSecretAttributes(cdkStack, `${cdkId}Secret`, {
    secretArn: password.secretArn,
    encryptionKey: kms.Key.fromKeyArn(cdkStack, `${cdkId}Key`, passwordsKmsKeyArn),
  });
  return secret.secretValue;
}
