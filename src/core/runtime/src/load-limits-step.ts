import { ServiceQuotas } from '@aws-accelerator/common/src/aws/service-quotas';
import { Account, getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { Limit, LimitOutput } from '@aws-accelerator/common-outputs/src/limits';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from './load-configuration-step';

export interface LoadLimitsInput extends LoadConfigurationInput {
  limitsSecretId: string;
  accounts: Account[];
  assumeRoleName: string;
}

interface LimitCode {
  serviceCode: string;
  quotaCode: string;
  enabled: boolean;
}

const LIMITS: { [limitKey: string]: LimitCode } = {
  [Limit.Ec2Eips]: {
    serviceCode: 'ec2',
    quotaCode: 'L-0263D0A3',
    enabled: true,
  },
  [Limit.VpcPerRegion]: {
    serviceCode: 'vpc',
    quotaCode: 'L-F678F1CE',
    enabled: true,
  },
  [Limit.VpcInterfaceEndpointsPerVpc]: {
    serviceCode: 'vpc',
    quotaCode: 'L-29B6F2EB',
    enabled: true,
  },
  [Limit.CloudFormationStackCount]: {
    serviceCode: 'cloudformation',
    quotaCode: 'L-0485CB21',
    enabled: true,
  },
  [Limit.CloudFormationStackSetPerAdmin]: {
    serviceCode: 'cloudformation',
    quotaCode: 'L-EC62D81A',
    enabled: true,
  },
  [Limit.OrganizationsMaximumAccounts]: {
    serviceCode: 'organizations',
    quotaCode: 'L-29A0C5DF',
    enabled: false,
  },
};

export const handler = async (input: LoadLimitsInput) => {
  console.log(`Loading limits...`);
  console.log(JSON.stringify(input, null, 2));

  const { configRepositoryName, configFilePath, limitsSecretId, accounts, assumeRoleName, configCommitId } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  // Capture limit results
  const limits: LimitOutput[] = [];

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const accountId = getAccountId(accounts, accountKey);

    if (!accountId) {
      console.warn(`Cannot find account with accountKey ${accountKey}`);
      continue;
    }

    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const quotas = new ServiceQuotas(credentials);

    // First check that all limits in the config exist
    const limitConfig = accountConfig.limits;
    const limitKeysFromConfig = Object.keys(limitConfig);
    for (const limitKey of limitKeysFromConfig) {
      const code = LIMITS[limitKey];
      if (!code) {
        console.warn(`Cannot find limit code with key "${limitKey}"`);
        continue;
      }
    }

    // The fetch all supported limits and request an increase if necessary
    for (const [limitKey, limitCode] of Object.entries(LIMITS)) {
      if (!limitKeysFromConfig.includes(limitKey)) {
        console.info(`Cannot find limit with key "${limitKey}" in accelerator config`);
        continue;
      }
      if (!limitCode.enabled) {
        console.warn(`The limit "${limitKey}" is not enabled`);
        continue;
      }

      const quota = await quotas.getServiceQuotaOrDefault({
        ServiceCode: limitCode.serviceCode,
        QuotaCode: limitCode.quotaCode,
      });
      let value = quota.Value!;
      const accountLimitConfig = limitConfig[limitKey];
      if (accountLimitConfig && accountLimitConfig['customer-confirm-inplace']) {
        value = accountLimitConfig.value;
      }

      // Keep track of limits so we can return them at the end of this function
      limits.push({
        accountKey,
        limitKey,
        serviceCode: limitCode.serviceCode,
        quotaCode: limitCode.quotaCode,
        value,
      });

      if (!accountLimitConfig) {
        console.debug(`Quota "${limitKey}" has no desired value for account "${accountKey}"`);
        continue;
      }

      const desiredValue = accountLimitConfig.value;

      if (value >= desiredValue) {
        console.debug(`Quota "${limitKey}" already has a value equal or larger than the desired value`);
        continue;
      }
      if (!quota.Adjustable) {
        console.warn(`Quota "${limitKey}" is not adjustable`);
        continue;
      }

      // Request the increase or renew if the previous request was more than two days ago
      await quotas.renewServiceQuotaIncrease({
        ServiceCode: limitCode.serviceCode,
        QuotaCode: limitCode.quotaCode,
        DesiredValue: desiredValue,
        MinTimeBetweenRequestsMillis: 1000 * 60 * 60 * 24 * 2, // Two days in milliseconds
      });
    }
  }

  // Store the limits in the secrets manager
  const secrets = new SecretsManager();
  await secrets.putSecretValue({
    SecretId: limitsSecretId,
    SecretString: JSON.stringify(limits, null, 2),
  });
};
