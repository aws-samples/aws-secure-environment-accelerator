import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig, GlobalOptionsAccountsConfig } from '@aws-pbmm/common-lambda/lib/config';
import { LandingZone } from '@aws-pbmm/common-lambda/lib/landing-zone';

export interface LoadConfigurationInput {
  configSecretSourceId: string;
  configSecretInProgressId: string;
}

export interface LoadConfigurationOutput {
  accounts: ConfigurationAccount[];
}

export type LandingZoneAccountType = 'primary' | 'security' | 'log-archive' | 'shared-services';

export interface ConfigurationAccount {
  accountKey: string;
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
  landingZoneAccountType?: LandingZoneAccountType;
}

export const handler = async (input: LoadConfigurationInput): Promise<LoadConfigurationOutput> => {
  console.log(`Loading configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const landingZone = new LandingZone();
  const landingZoneStack = await landingZone.findLandingZoneStack();
  if (!landingZoneStack) {
    throw new Error(`Cannot find a Landing Zone stack in your account`);
  }
  console.log(`Detected Landing Zone stack with version "${landingZoneStack.version}"`);

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

  // Store the discovered accounts in this object
  const accounts: ConfigurationAccount[] = [];

  // First load mandatory accounts configuration from
  const accountsConfig = config['global-options'].accounts;
  const mandatoryAccountConfigs = config['mandatory-account-configs'];
  for (const [accountKey, mandatoryAccountConfig] of Object.entries(mandatoryAccountConfigs)) {
    const accountName = mandatoryAccountConfig['account-name'];
    accounts.push({
      accountKey,
      accountName,
      emailAddress: mandatoryAccountConfig.email,
      organizationalUnit: mandatoryAccountConfig.ou,
      landingZoneAccountType: getLzAccountTypeByAccountKey(accountsConfig, accountKey),
    });
  }

  for (const lzOrganizationalUnit of landingZoneStack.config.organizational_units) {
    const lzOrganizationalUnitName = lzOrganizationalUnit.name;
    if (!lzOrganizationalUnit.core_accounts) {
      continue;
    }

    for (const lzAccount of lzOrganizationalUnit.core_accounts) {
      // TODO Check if Accelerator OU    matches LZ OU
      // TODO Check if Accelerator email matches LZ email
      const lzAccountType = getLandingZoneAccountTypeBySsmParameters(lzAccount.ssm_parameters);
      if (!lzAccountType) {
        throw new Error(`Cannot detect Landing Zone account type for account with name "${lzAccount.name}"`);
      }

      const acceleratorAccount = accounts.find((a) => a.landingZoneAccountType === lzAccountType);
      if (acceleratorAccount) {
        // When we find configuration for this account in the Accelerator config, then verify if properties match
        if (acceleratorAccount.accountName !== lzAccount.name) {
          throw new Error(
            `The Acceleror account name and Landing Zone account name for account type "${lzAccountType}" do not match.\n` +
              `"${acceleratorAccount.accountName}" != "${lzAccount.name}"`,
          );
        }
        // Only validate email address and OU for non-primary accounts
        if (lzAccountType !== 'primary') {
          if (acceleratorAccount.emailAddress !== lzAccount.email) {
            throw new Error(
              `The Acceleror account email and Landing Zone account email for account type "${lzAccountType}" do not match.\n` +
                `"${acceleratorAccount.emailAddress}" != "${lzAccount.email}"`,
            );
          }
          if (acceleratorAccount.organizationalUnit !== lzOrganizationalUnitName) {
            throw new Error(
              `The Acceleror account OU and Landing Zone OU email for account type "${lzAccountType}" do not match.\n` +
                `"${acceleratorAccount.organizationalUnit}" != "${lzOrganizationalUnitName}"`,
            );
          }
        }
      } else {
        const accountKey = getAccountKeyByLzAccountType(accountsConfig, lzAccountType);
        if (!accountKey) {
          throw new Error(`Cannot detect account key for Landing Zone account type ${lzAccount}`);
        }
        const emailAddress = lzAccount.email;
        if (!emailAddress) {
          throw new Error(`Email address in Landing Zone for account with name "${lzAccount.name}" is not set`);
        }

        accounts.push({
          accountKey,
          accountName: lzAccount.name,
          emailAddress,
          organizationalUnit: lzOrganizationalUnitName,
          landingZoneAccountType: lzAccountType,
        });
      }
    }
  }

  // Find all relevant accounts in the organization
  return {
    accounts,
    // TODO Add more relevant configuration values
  };
};

/**
 * Get the type of the account by looking at the Landing Zone account configuration in the Accelerator config.
 *
 * @param accountsConfig The Accelerator config accounts config
 * @param accountKey The key of the account in the Accelerator config
 */
function getLzAccountTypeByAccountKey(
  accountsConfig: GlobalOptionsAccountsConfig,
  accountKey: string,
): LandingZoneAccountType | undefined {
  if (accountsConfig['lz-primary-account'] === accountKey) {
    return 'primary';
  } else if (accountsConfig['lz-security-account'] === accountKey) {
    return 'security';
  } else if (accountsConfig['lz-log-archive-account'] === accountKey) {
    return 'log-archive';
  } else if (accountsConfig['lz-shared-services-account'] === accountKey) {
    return 'shared-services';
  }
  return undefined;
}

/**
 * Get the account key by looking at the Landing Zone account configuration in the Accelerator config.
 *
 * @param accountsConfig The Accelerator config accounts config
 * @param accountKey The type of the account in the Landing Zone config
 */
function getAccountKeyByLzAccountType(
  accountsConfig: GlobalOptionsAccountsConfig,
  lzAccountType: LandingZoneAccountType,
): string | undefined {
  if (lzAccountType === 'primary') {
    return accountsConfig['lz-primary-account'];
  } else if (lzAccountType === 'security') {
    return accountsConfig['lz-security-account'];
  } else if (lzAccountType === 'log-archive') {
    return accountsConfig['lz-log-archive-account'];
  } else if (lzAccountType === 'shared-services') {
    return accountsConfig['lz-shared-services-account'];
  }
  return undefined;
}

function getLandingZoneAccountTypeBySsmParameters(
  ssmParameters: { name: string; value: string }[],
): LandingZoneAccountType | undefined {
  const accountIdParameter = ssmParameters.find((p) => p.value === '$[AccountId]');
  if (!accountIdParameter) {
    return undefined;
  }
  const name = accountIdParameter.name;
  if (name === '/org/primary/account_id') {
    return 'primary';
  } else if (name === '/org/member/security/account_id') {
    return 'security';
  } else if (name === '/org/member/logging/account_id') {
    return 'log-archive';
  } else if (name === '/org/member/sharedservices/account_id') {
    return 'shared-services';
  }
  return undefined;
}
