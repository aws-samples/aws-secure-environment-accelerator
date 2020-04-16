import * as aws from 'aws-sdk';
import * as pwgen from 'generate-password';
import { SecretsManager } from '../aws/secrets-manager';

export interface GeneratePasswordProps {
  secretName: string;
  kmsKeyId?: string;
  length?: number;
  numbers?: boolean;
  symbols?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  credentials?: aws.Credentials;
  roleArns?: string[];
}

export interface GeneratePasswordOutput {
  password: string;
  secretArn: string;
}

export async function generatePasswordSecret(props: GeneratePasswordProps): Promise<GeneratePasswordOutput> {
  const {
    secretName,
    kmsKeyId,
    length = 16,
    numbers = true,
    symbols = true,
    lowercase = true,
    uppercase = true,
    roleArns = [],
    credentials,
  } = props;

  let secretArn: string | undefined;
  let password: string | undefined;
  const secrets = new SecretsManager(credentials);
  try {
    const existingSecret = await secrets.getSecret(secretName);
    secretArn = existingSecret.ARN!;
    password = existingSecret.SecretString!;
  } catch (error) {
    console.log(`Secret with name "${secretName}" does not exist`);
  }

  if (!secretArn) {
    // Generate a password with the given length
    password = pwgen.generate({
      length,
      numbers,
      symbols,
      lowercase,
      uppercase,
    });

    console.log(`Creating secret for password with name "${secretName}"`);

    // Store the password in the given secret
    const secret = await secrets.createSecret({
      Name: secretName,
      SecretString: password,
      KmsKeyId: kmsKeyId,
    });
    secretArn = secret.ARN!;
  }

  if (roleArns.length > 0) {
    console.log(`Updating resource policy for secret with name "${secretName}"`);

    await secrets.putResourcePolicy({
      SecretId: secretArn,
      ResourcePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 'secretsmanager:GetSecretValue',
            Resource: '*',
            Principal: {
              AWS: roleArns,
            },
          },
        ],
      }),
    });
  }
  return {
    secretArn,
    password: password!,
  };
}
