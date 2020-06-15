import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { compareAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/compare/main';

export interface StepInput {
  inputConfig: CompareConfigurationInput;
  commitSecretId: string;
  region: string;
}

export interface CompareConfigurationInput {
  configuration: ConfigurationInput;
  configOverrides: { [key: string]: boolean } | undefined;
  overrideComparison: boolean | undefined;
}

export interface ConfigurationInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
}

export interface CompareConfigurationsOutput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
}

export const handler = async (input: StepInput): Promise<CompareConfigurationsOutput> => {
  console.log(`Loading compare configurations...`);
  console.log(JSON.stringify(input, null, 2));

  const overrideConfig: { [name: string]: boolean } = {
    'ov-global-options': false,
    'ov-del-accts': false,
    'ov-ren-accts': false,
    'ov-acct-email': false,
    'ov-acct-ou': false,
    'ov-acct-vpc': false,
    'ov-acct-subnet': false,
    'ov-tgw': false,
    'ov-mad': false,
    'ov-ou-vpc': false,
    'ov-ou-subnet': false,
    'ov-share-to-ou': false,
    'ov-share-to-accounts': false,
    'ov-nacl': false,
  };

  const { inputConfig, commitSecretId, region } = input;

  const configFilePath = inputConfig.configuration.configFilePath;
  const configRepositoryName = inputConfig.configuration.configRepositoryName;
  const configCommitId = inputConfig.configuration.configCommitId;

  const secrets = new SecretsManager();
  const previousCommitIdSecret = await secrets.getSecret(commitSecretId);
  const previousCommitId = previousCommitIdSecret.SecretString;

  if (inputConfig.overrideComparison || !previousCommitId || configCommitId === previousCommitId) {
    console.log(
      'either previous git repo commitId not found or "overrideComparison" passed as true, so skipping validation of config file updates',
    );
    return {
      configRepositoryName,
      configFilePath,
      configCommitId,
    };
  }

  let errors: string[] = [];
  if (inputConfig.configOverrides) {
    const keys = Object.keys(overrideConfig);
    for (const [overrideName, overrideValue] of Object.entries(inputConfig.configOverrides)) {
      if (overrideValue && keys.includes(overrideName)) {
        overrideConfig[overrideName] = overrideValue;
      }
    }
  }
  console.log('passing override configuration to validate changes', overrideConfig);

  errors = await compareAcceleratorConfig({
    repositoryName: configRepositoryName,
    configFilePath,
    commitId: configCommitId,
    previousCommitId,
    region,
    overrideConfig,
  });

  // Throw all errors at once
  if (errors.length > 0) {
    throw new Error(`There were errors while comparing the configuration changes:\n${errors.join('\n')}`);
  }

  return {
    configRepositoryName,
    configFilePath,
    configCommitId,
  };
};
