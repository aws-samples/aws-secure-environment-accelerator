import * as pwgen from 'generate-password';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig, PasswordsConfig } from '@aws-pbmm/common-lambda/lib/config';

interface CreatePasswordsInput {
  configSecretId: string;
}

export const handler = async (input: CreatePasswordsInput) => {
  console.log(`Creating passwords...`);
  console.log(JSON.stringify(input, null, 2));

  const { configSecretId } = input;

  const secrets = new SecretsManager();
  const source = await secrets.getSecret(configSecretId);

  // Load the configuration from Secrets Manager
  const configString = source.SecretString!;
  const config = AcceleratorConfig.fromString(configString);

  // Verify if the passwords exists and generate and store the passwords if they don't
  const passwordsConfig: PasswordsConfig = config['global-options'].passwords;
  for (const [passwordId, passwordConfig] of Object.entries(passwordsConfig)) {
    const secretName = passwordConfig['secret-name'];
    let secret;
    try {
      secret = await secrets.getSecret(secretName);
    } catch (error) {
      console.log(`Secret with name "${secretName}" does not exist`);
    }
    if (secret) {
      console.log(`Secret for password with ID "${passwordId}" already exists`);
      console.log(`Secret ARN "${secret.ARN}"`);
      continue;
    }

    // Generate a password with the given length
    const password = pwgen.generate({
      length: passwordConfig.length,
      numbers: true,
      symbols: true,
      lowercase: true,
      uppercase: true,
    });

    console.log(`Creating secret for password with ID "${passwordId}"`);

    // Store the password in the given secret
    await secrets.createSecret({
      Name: secretName,
      SecretString: password,
    });
  }

  return {
    status: 'SUCCESS',
  };
};
