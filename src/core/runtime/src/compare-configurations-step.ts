import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import { compareAcceleratorConfig } from '@aws-accelerator/common-config/src/compare/main';
import { getCommitIdSecretName } from '@aws-accelerator/common-outputs/src/commitid-secret';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { loadAccounts } from './utils/load-accounts';

export interface StepInput extends ConfigurationInput {
  inputConfig: AcceleratorInput;
  region: string;
  parametersTableName: string;
}

export interface AcceleratorInput {
  configOverrides?: { [key: string]: boolean };
  overrideComparison?: boolean;
  scope?: 'FULL' | 'NEW-ACCOUNTS' | 'GLOBAL-OPTIONS' | 'ACCOUNT' | 'OU';
  mode?: 'APPLY';
  targetAccounts?: string[];
  targetOus?: string[];
}

export interface ConfigurationInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  baseline: string;
}

export interface CompareConfigurationsOutput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
}

const dynamodb = new DynamoDB();

export const handler = async (input: StepInput) => {
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

  const {
    inputConfig,
    region,
    baseline,
    configCommitId,
    configFilePath,
    configRepositoryName,
    parametersTableName,
  } = input;
  const commitSecretId = getCommitIdSecretName();

  const secrets = new SecretsManager();
  let previousCommitId;
  try {
    const previousCommitIdSecret = await secrets.getSecret(commitSecretId);
    previousCommitId = previousCommitIdSecret.SecretString;
  } catch (e) {
    console.log('previous successful run commitId not found');
  }

  if (inputConfig.overrideComparison || !previousCommitId || configCommitId === previousCommitId) {
    console.log(
      'either previous git repo commitId not found or commitIds are same, so skipping validation of config file updates',
    );
    return;
  }
  let configOverrides = inputConfig.configOverrides;
  if (baseline === 'ORGANIZATIONS') {
    if (!configOverrides) {
      configOverrides = {};
    }
    // Explicitly setting true even if user provides false in overideConfig when baseline is ORGANIZATIONS
    configOverrides['ov-acct-ou'] = true;
    configOverrides['ov-ren-accts'] = true;
    configOverrides['ov-acct-email'] = true;
  }
  let errors: string[] = [];
  if (configOverrides) {
    for (const [overrideName, overrideValue] of Object.entries(configOverrides)) {
      console.log(overrideName, overrideValue);
      if (overrideValue) {
        overrideConfig[overrideName] = overrideValue;
      }
    }
  }
  console.log('passing override configuration to validate changes', overrideConfig);
  const { scope, targetAccounts, targetOus } = inputConfig;

  const accounts = await loadAccounts(parametersTableName, dynamodb);
  const targetAccountKeys: string[] = [];
  if (targetAccounts) {
    targetAccounts.map(targetAccount => {
      if (targetAccount === 'ALL') {
        targetAccountKeys.push('ALL');
      } else if (targetAccount === 'NEW') {
        targetAccountKeys.push('NEW');
      } else {
        targetAccountKeys.push(accounts.find(acc => acc.id === targetAccount)?.key!);
      }
    });
  }

  errors = await compareAcceleratorConfig({
    repositoryName: configRepositoryName,
    configFilePath,
    commitId: configCommitId,
    previousCommitId,
    region,
    overrideConfig,
    scope: scope || 'NEW-ACCOUNTS',
    targetAccounts: targetAccountKeys,
    targetOus,
  });

  // Throw all errors at once
  if (errors.length > 0) {
    throw new Error(`There were errors while comparing the configuration changes:\n${errors.join('\n')}`);
  }
  return;
};
