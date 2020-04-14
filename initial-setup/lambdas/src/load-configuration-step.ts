import * as org from 'aws-sdk/clients/organizations';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig, GlobalOptionsAccountsConfig } from '@aws-pbmm/common-lambda/lib/config';
import { LandingZone } from '@aws-pbmm/common-lambda/lib/landing-zone';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';

const LandingZoneAccountTypes = ['primary', 'security', 'log-archive', 'shared-services'] as const;

export interface LoadConfigurationInput {
  configSecretSourceId: string;
  configSecretInProgressId: string;
}

export interface LoadConfigurationOutput {
  accounts: ConfigurationAccount[];
  warnings: string[];
}

export type LandingZoneAccountType = typeof LandingZoneAccountTypes[number];

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

  const organizations = new Organizations();
  const organizationalUnits = await organizations.listOrganizationalUnits();
  const organizationalUnitAccountMap: { [ouId: string]: org.Account[] } = {};
  const accounts: org.Account[] = [];

  // Store organizational units and their accounts
  for (const organizationalUnit of organizationalUnits) {
    const ouId = organizationalUnit.Id!;
    const accountsInOu = await organizations.listAccountsForParent(ouId);

    // Associate accounts to organizational unit
    organizationalUnitAccountMap[ouId] = accountsInOu;

    // Store the accounts in a simple list as well
    accounts.push(...accountsInOu);
  }

  console.log(`Found organizational units:`);
  console.log(JSON.stringify(organizationalUnits, null, 2));

  // Keep track of errors and warnings instead of failing immediately
  const errors = [];
  const warnings = [];

  // Store the discovered accounts in this object
  const configurationAccounts: ConfigurationAccount[] = [];

  // -------------------------------- \\
  // VERIFY ACCELERATOR CONFIGURATION \\
  // -------------------------------- \\

  // First load mandatory accounts configuration
  const accountsConfig = config['global-options'].accounts;
  const mandatoryAccountConfigs = config['mandatory-account-configs'];
  for (const [accountKey, mandatoryAccountConfig] of Object.entries(mandatoryAccountConfigs)) {
    const accountConfigName = mandatoryAccountConfig['account-name'];
    const accountConfigEmail = mandatoryAccountConfig.email;

    // Find the organizational account used by this
    const organizationalUnitName = mandatoryAccountConfig.ou;
    const organizationalUnit = organizationalUnits.find(ou => ou.Name === organizationalUnitName);
    if (!organizationalUnit) {
      errors.push(`Cannot find organizational unit "${mandatoryAccountConfig.ou}" that is used by Accelerator`);
      continue;
    }

    const landingZoneAccountType = getLzAccountTypeByAccountKey(accountsConfig, accountKey);
    if (landingZoneAccountType === 'primary') {
      // If the account is a primary account, then look for it by its email address
      const accountsInOu = organizationalUnitAccountMap[organizationalUnit.Id!];
      const account = accountsInOu.find(a => a.Email === accountConfigEmail);
      if (!account) {
        errors.push(
          `Cannot find primary account with email "${accountConfigEmail}" in organizational unit "${organizationalUnitName}"`,
        );
        continue;
      }
    } else {
      // If the account is a primary account, then look for it by its name
      const accountsInOu = organizationalUnitAccountMap[organizationalUnit.Id!];
      const account = accountsInOu.find(a => a.Name === accountConfigName);
      if (!account) {
        errors.push(
          `Cannot find non-primary account with name "${accountConfigName}" in organizational unit "${organizationalUnitName}"`,
        );
        continue;
      }
      if (account.Email !== accountConfigEmail) {
        errors.push(
          `The account email for account with name "${accountConfigName}" does not match the email in the Accelerator configuration.\n` +
            `"${account.Email}" != "${accountConfigEmail}"`,
        );
        continue;
      }
    }

    configurationAccounts.push({
      accountKey,
      accountName: accountConfigName,
      emailAddress: mandatoryAccountConfig.email,
      organizationalUnit: mandatoryAccountConfig.ou,
      landingZoneAccountType,
    });
  }

  // --------------------------------- \\
  // VERIFY LANDING ZONE CONFIGURATION \\
  // --------------------------------- \\

  // Check if there are additional OUs that are not managed by Landing Zone
  const lzOrganizationalUnits = landingZoneStack.config.organizational_units;
  if (organizationalUnits.length !== lzOrganizationalUnits.length) {
    warnings.push(
      `There are ${organizationalUnits.length} organizational units in the organization while there are only ` +
        `${lzOrganizationalUnits.length} organizational units in the Landing Zone configuration\n` +
        `  Organizational units in organization: ${organizationalUnits.map(ou => ou.Name).join(', ')}\n` +
        `  Organizational units in config:       ${lzOrganizationalUnits.map(ou => ou.name).join(', ')}\n`,
    );
  }

  // Next we verify if the Landing Zone account configuration matches the Accelerator account configuration
  for (const lzOrganizationalUnit of lzOrganizationalUnits) {
    const lzOrganizationalUnitName = lzOrganizationalUnit.name;
    if (!lzOrganizationalUnit.core_accounts) {
      continue;
    }

    const organizationalUnit = organizationalUnits.find(ou => ou.Name === lzOrganizationalUnitName);
    if (!organizationalUnit) {
      errors.push(`Cannot find organizational unit "${lzOrganizationalUnitName}" that is used by Landing Zone`);
      continue;
    }

    const accountsInOu = organizationalUnitAccountMap[organizationalUnit.Id!];

    for (const lzAccount of lzOrganizationalUnit.core_accounts) {
      const lzAccountType = getLandingZoneAccountTypeBySsmParameters(lzAccount.ssm_parameters);
      if (!lzAccountType) {
        errors.push(`Cannot detect Landing Zone account type for account with name "${lzAccount.name}"`);
        continue;
      }

      if (lzAccountType === 'primary') {
        // If the account is a primary account, then look for it by its email
        const account = accountsInOu.find(a => a.Email === lzAccount.email);
        if (!account) {
          errors.push(`Cannot find primary account with email "${lzAccount.email}" that is used by Landing Zone`);
          continue;
        }
      } else {
        // If the account is a non-primary account, then look for it by its name
        const account = accountsInOu.find(a => a.Name === lzAccount.name);
        if (!account) {
          errors.push(`Cannot find non-primary account with name "${lzAccount.name}" that is used by Landing Zone`);
          continue;
        }
      }

      const acceleratorAccount = configurationAccounts.find(a => a.landingZoneAccountType === lzAccountType);
      if (acceleratorAccount) {
        // When we find configuration for this account in the Accelerator config, then verify if properties match
        if (acceleratorAccount.accountName !== lzAccount.name) {
          errors.push(
            `The Acceleror account name and Landing Zone account name for account type "${lzAccountType}" do not match.\n` +
              `"${acceleratorAccount.accountName}" != "${lzAccount.name}"`,
          );
        }

        // Only validate email address and OU for non-primary accounts
        if (lzAccountType !== 'primary') {
          if (acceleratorAccount.emailAddress !== lzAccount.email) {
            errors.push(
              `The Acceleror account email and Landing Zone account email for account type "${lzAccountType}" do not match.\n` +
                `"${acceleratorAccount.emailAddress}" != "${lzAccount.email}"`,
            );
          }
          if (acceleratorAccount.organizationalUnit !== lzOrganizationalUnitName) {
            errors.push(
              `The Acceleror account OU and Landing Zone OU email for account type "${lzAccountType}" do not match.\n` +
                `"${acceleratorAccount.organizationalUnit}" != "${lzOrganizationalUnitName}"`,
            );
          }
        }
      } else {
        // We found a Landing Zone account that is not defined in the Accelerator config
        const accountKey = getAccountKeyByLzAccountType(accountsConfig, lzAccountType);
        if (!accountKey) {
          errors.push(`Cannot detect account key for Landing Zone account type ${lzAccount}`);
        }
        if (!lzAccount.email) {
          errors.push(`Email address in Landing Zone for account with name "${lzAccount.name}" is not set`);
        }

        if (accountKey && lzAccount.email) {
          configurationAccounts.push({
            accountKey,
            accountName: lzAccount.name,
            emailAddress: lzAccount.email,
            organizationalUnit: lzOrganizationalUnitName,
            landingZoneAccountType: lzAccountType,
          });
        }
      }
    }
  }

  // Verify if all Landing Zone accounts are there
  for (const landingZoneAccountType of LandingZoneAccountTypes) {
    const lzAccount = configurationAccounts.find(a => a.landingZoneAccountType === landingZoneAccountType);
    if (!lzAccount) {
      errors.push(`Could not find Landing Zone account of type "${landingZoneAccountType}"`);
    }
  }

  // Verify if there are additional accounts in the OU that are not managed by Landing Zone or Accelerator
  for (const organizationalUnit of organizationalUnits) {
    const accountsInOu = organizationalUnitAccountMap[organizationalUnit.Id!];
    const acceleratorAccountsInOu = configurationAccounts.filter(
      account => account.organizationalUnit === organizationalUnit.Name,
    );
    if (accountsInOu.length !== acceleratorAccountsInOu.length) {
      warnings.push(
        `There are ${accountsInOu.length} accounts in OU "${organizationalUnit.Name}" while there are only ` +
          `${acceleratorAccountsInOu.length} accounts in the Landing Zone and Accelerator configuration\n` +
          `  Accounts in OU:     ${accountsInOu.map(a => a.Name).join(', ')}\n` +
          `  Accounts in config: ${acceleratorAccountsInOu.map(a => a.accountName).join(', ')}\n`,
      );
    }
  }

  // Throw all errors at once
  if (errors.length > 0) {
    throw new Error(`There were errors while loading the configuration:\n${errors.join('\n')}`);
  }

  return {
    accounts: configurationAccounts,
    warnings,
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
  const accountIdParameter = ssmParameters.find(p => p.value === '$[AccountId]');
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
