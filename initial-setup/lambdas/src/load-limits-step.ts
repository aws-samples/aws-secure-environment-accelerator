import { ServiceQuotas } from '@aws-pbmm/common-lambda/lib/aws/service-quotas';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getAccountId } from '../../templates/src/utils/accounts';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';

export interface LoadLimitsInput {
  configSecretId: string;
  accounts: Account[];
  assumeRoleName: string;
}

export type LoadLimitsOutput = Limit[];

export interface Limit {
  accountKey: string;
  limitCodeKey: string;
  serviceCode: string;
  quotaCode: string;
  value: number;
}

interface LimitCode {
  serviceCode: string;
  quotaCode: string;
  enabled: boolean;
}

const LIMIT_CODES: { [limitKey: string]: LimitCode } = {
  'Amazon VPC/VPCs per Region': {
    serviceCode: 'vpc',
    quotaCode: 'L-F678F1CE',
    enabled: true,
  },
  'Amazon VPC/Interface VPC endpoints per VPC': {
    serviceCode: 'vpc',
    quotaCode: 'L-29B6F2EB',
    enabled: true,
  },
  'AWS CloudFormation/Stack count': {
    serviceCode: 'cloudformation',
    quotaCode: 'L-0485CB21',
    enabled: true,
  },
  'AWS CloudFormation/Stack sets per administrator account': {
    serviceCode: 'cloudformation',
    quotaCode: 'L-31709F13',
    enabled: true,
  },
  'AWS Organizations/Maximum accounts': {
    serviceCode: 'organizations',
    quotaCode: 'L-29A0C5DF',
    enabled: false,
  }
};

export const handler = async (input: LoadLimitsInput): Promise<LoadLimitsOutput> => {
  console.log(`Loading limits...`);
  console.log(JSON.stringify(input, null, 2));

  const { configSecretId, accounts, assumeRoleName } = input;

  const secrets = new SecretsManager();
  const secret = await secrets.getSecret(configSecretId);

  // Load the configuration from Secrets Manager
  const configString = secret.SecretString!;
  const config = AcceleratorConfig.fromString(configString);

  // Capture limit results
  const limits: Limit[] = [];

  const accountConfigs = config['mandatory-account-configs'];
  for (const [accountKey, accountConfig] of Object.entries(accountConfigs)) {
    const accountId = getAccountId(accounts, accountKey);

    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const quotas = new ServiceQuotas(credentials);

    const limitConfig = accountConfig.limits;
    for (const [limitCodeKey, desiredValue] of Object.entries(limitConfig)) {
      const code = LIMIT_CODES[limitCodeKey];
      if (!code) {
        throw new Error(`Cannot find limit code with key "${limitCodeKey}"`);
      }
      if (!code.enabled) {
        console.warn(`The limit "${limitCodeKey}" is not enabled`);
        continue;
      }

      const quota = await quotas.getServiceQuotaOrDefault({
        ServiceCode: code.serviceCode,
        QuotaCode: code.quotaCode,
      });
      const value = quota.Value!;

      // Keep track of limits so we can return them at the end of this function
      limits.push({
        accountKey,
        limitCodeKey,
        serviceCode: code.serviceCode,
        quotaCode: code.quotaCode,
        value,
      });

      if (value >= desiredValue) {
        console.debug(`Quota "${limitCodeKey}" already has a value equal or larger than the desired value`);
        continue;
      }
      if (!quota.Adjustable) {
        console.warn(`Quota "${limitCodeKey}" is not adjustable`);
        continue;
      }

      // Request the increase or renew if the previous request was more than two days ago
      await quotas.renewServiceQuotaIncrease({
        ServiceCode: code.serviceCode,
        QuotaCode: code.quotaCode,
        DesiredValue: desiredValue,
        MinTimeBetweenRequestsMillis: 1000 * 60 * 60 * 24 * 2, // Two days in milliseconds
      });
    }
  }

  return limits;
};
