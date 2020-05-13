import { ServiceQuotas } from '@aws-pbmm/common-lambda/lib/aws/service-quotas';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getAccountId } from '../../templates/src/utils/accounts';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';

export interface LoadLimitsInput {
  configSecretId: string;
  limitsSecretId: string;
  accounts: Account[];
  assumeRoleName: string;
}

export interface LimitOutput {
  accountKey: string;
  limitKey: string;
  serviceCode: string;
  quotaCode: string;
  value: number;
}

interface LimitCode {
  serviceCode: string;
  quotaCode: string;
  enabled: boolean;
}

// TODO Move this to common so we can use it from initial-setup/cdk
enum Limit {
  Ec2Eips = 'Amazon EC2/Number of EIPs',
  VpcPerRegion = 'Amazon VPC/VPCs per Region',
  VpcInterfaceEndpointsPerVpc = 'Amazon VPC/Interface VPC endpoints per VPC',
  CloudFormationStackCount = 'AWS CloudFormation/Stack count',
  CloudFormationStackSetPerAdmin = 'AWS CloudFormation/Stack sets per administrator account',
  OrganizationsMaximumAccounts = 'AWS Organizations/Maximum accounts',
}

const LIMITS: { [limitKey: string]: LimitCode } = {
  [Limit.Ec2Eips]: {
    serviceCode: 'ec2',
    quotaCode: 'L-D0B7243C',
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
    quotaCode: 'L-31709F13',
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

  const { configSecretId, limitsSecretId, accounts, assumeRoleName } = input;

  const secrets = new SecretsManager();
  const secret = await secrets.getSecret(configSecretId);

  // Load the configuration from Secrets Manager
  const configString = secret.SecretString!;
  const config = AcceleratorConfig.fromString(configString);

  // Capture limit results
  const limits: LimitOutput[] = [];

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const accountId = getAccountId(accounts, accountKey);

    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const quotas = new ServiceQuotas(credentials);

    // First check that all limits in the config exist
    const limitConfig = accountConfig.limits;
    for (const limitKey of Object.keys(limitConfig)) {
      const code = LIMITS[limitKey];
      if (!code) {
        throw new Error(`Cannot find limit code with key "${limitKey}"`);
      }
    }

    // The fetch all supported limits and request an increase if necessary
    for (const [limitKey, limitCode] of Object.entries(LIMITS)) {
      if (!limitCode.enabled) {
        console.warn(`The limit "${limitKey}" is not enabled`);
        continue;
      }

      const quota = await quotas.getServiceQuotaOrDefault({
        ServiceCode: limitCode.serviceCode,
        QuotaCode: limitCode.quotaCode,
      });
      const value = quota.Value!;

      // Keep track of limits so we can return them at the end of this function
      limits.push({
        accountKey,
        limitKey,
        serviceCode: limitCode.serviceCode,
        quotaCode: limitCode.quotaCode,
        value,
      });

      const desiredValue = limitConfig[limitKey];
      if (!desiredValue) {
        console.debug(`Quota "${limitKey}" has no desired value for account "${accountKey}"`);
        continue;
      }
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
  await secrets.putSecretValue({
    SecretId: limitsSecretId,
    SecretString: JSON.stringify(limits, null, 2),
  });
};
