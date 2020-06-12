import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';

const OVERRIDE_KEYS = [
  'ov-global-options',
  'ov-del-accts',
  'ov-ren-accts',
  'ov-acct-ou',
  'ov-acct-vpc',
  'ov-acct-subnet',
  'ov-tgw',
  'ov-mad',
  'ov-ou-vpc',
  'ov-ou-subnet',
  'ov-share-to-ou',
  'ov-share-to-accounts',
  'ov-nacl',
];

export interface StepInput {
  inputConfig: CompareConfigurationInput;
  commitSecretId: string;
  region: string;
}

export interface CompareConfigurationInput {
  configuration: ConfigurationInput;
  configOverrides: ConfigOverride[] | undefined;
}

export interface ConfigurationInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
}

export interface ConfigOverride {
  name: string;
  isEnabled: boolean;
}

export interface CompareConfigurationsOutput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
}

export const handler = async (input: StepInput): Promise<CompareConfigurationsOutput> => {
  console.log(`Loading compare configurations...`);
  console.log(JSON.stringify(input, null, 2));

  const { inputConfig, commitSecretId, region } = input;

  console.log('commitSecretId', commitSecretId);
  const secrets = new SecretsManager();
  const previousCommitIdSecret = await secrets.getSecret(commitSecretId);
  const previousCommitId = previousCommitIdSecret.SecretString;
  console.log('previousCommitId', previousCommitId);

  const configFilePath = inputConfig.configuration.configFilePath;
  const configRepositoryName = inputConfig.configuration.configRepositoryName;
  const configCommitId = inputConfig.configuration.configCommitId;

  if (inputConfig.configOverrides) {
    for (const configOverride of inputConfig.configOverrides) {
      console.log('configOverride', configOverride.name, configOverride.isEnabled);
    }
  } else {
    console.log('no override configurations found');
  }

  // Keep track of errors and warnings instead of failing immediately
  // const errors = [];

  // Throw all errors at once
  // if (errors.length > 0) {
  //   throw new Error(`There were errors while loading the configuration:\n${errors.join('\n')}`);
  // }
  console.log('configRepositoryName', configRepositoryName);

  return {
    configRepositoryName,
    configFilePath,
    configCommitId,
  };
};
