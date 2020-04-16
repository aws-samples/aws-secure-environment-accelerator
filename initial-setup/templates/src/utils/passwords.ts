import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { PasswordConfig, PasswordsConfig } from '@aws-pbmm/common-lambda/lib/config';

const secrets = new SecretsManager();

export async function getPasswordById(passwordsConfig: PasswordsConfig, passwordId: string): Promise<string> {
  const passwordConfig = passwordsConfig[passwordId];
  if (!passwordConfig) {
    throw new Error(`Cannot find password with ID "${passwordId}"`);
  }
  return getPassword(passwordConfig);
}

export async function getPassword(passwordConfig: PasswordConfig): Promise<string> {
  if (process.env.CONFIG_MODE === 'development') {
    return 'dummy';
  }
  const secret = await secrets.getSecret(passwordConfig['secret-name']);
  return secret.SecretString!;
}
