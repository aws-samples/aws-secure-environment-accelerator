import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Account } from './load-accounts-step';

export interface LoadConfigurationInput {
  configSecretSourceId: string;
  configSecretInProgressId: string;
}

export interface LoadConfigurationOutput {
  accounts: ConfigurationAccount[];
}

export interface ConfigurationAccount {
  accountKey: string;
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
  isMasterAccount: boolean;
}

export const handler = async (input: LoadConfigurationInput): Promise<LoadConfigurationOutput> => {
  console.log(`Loading configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const { configSecretSourceId, configSecretInProgressId } = input;

  const secrets = new SecretsManager();
  const source = await secrets.getSecret(configSecretSourceId);

  // Load the configuration from Secrets Manager
  const configString = source.SecretString!;
  const config = AcceleratorConfig.fromString(configString);

  // Store a copy of the secret
  await secrets.putSecretValue({
    SecretId: configSecretInProgressId,
    SecretString: configString,
  });

  const accountsConfig = config['global-options']['accounts'];
  const masterAccountName = accountsConfig['master-account-name'];

  const accounts = [];
  const mandatoryAccountConfigs = config['mandatory-account-configs'];
  for (const [accountKey, mandatoryAccountConfig] of Object.entries(mandatoryAccountConfigs)) {
    const accountName = mandatoryAccountConfig['account-name'];
    accounts.push({
      accountKey,
      accountName,
      emailAddress: mandatoryAccountConfig.email,
      organizationalUnit: mandatoryAccountConfig.ou,
      isMasterAccount: accountName === masterAccountName,
    });
  }

  // Find all relevant accounts in the organization
  return {
    accounts,
    // TODO Add more relevant configuration values
  };
};
