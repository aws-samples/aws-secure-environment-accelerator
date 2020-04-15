import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig, GlobalOptionsAccountsConfig } from '@aws-pbmm/common-lambda/lib/config';
import { LandingZone } from '@aws-pbmm/common-lambda/lib/landing-zone';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';

export interface LoadConfigurationInput {
  configSecretSourceId: string;
  configSecretInProgressId: string;
}

export interface LoadConfigurationOutput {
  accounts: ConfigurationAccount[];
  warnings: string[];
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

  const organizations = new Organizations();
  const organizationalUnits = await organizations.listOrganizationalUnits();

  console.log(`Found organizational units:`);
  console.log(JSON.stringify(organizationalUnits, null, 2));

  // Keep track of errors and warnings instead of failing immediately
  const errors = [];
  const warnings = [];

  // Verify if there are additional OUs that are not managed by Landing Zone
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

    for (const lzAccount of lzOrganizationalUnit.core_accounts) {
      const lzAccountType = getLandingZoneAccountTypeBySsmParameters(lzAccount.ssm_parameters);
      if (!lzAccountType) {
        errors.push(`Cannot detect Landing Zone account type for account with name "${lzAccount.name}"`);
        continue;
      }

      const acceleratorAccount = accounts.find(a => a.landingZoneAccountType === lzAccountType);
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
        const emailAddress = lzAccount.email;
        if (!emailAddress) {
          errors.push(`Email address in Landing Zone for account with name "${lzAccount.name}" is not set`);
        }

        if (accountKey && emailAddress) {
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
  }

  // Verify if there are additional accounts in the OU that are not managed by Landing Zone or Accelerator
  for (const organizationalUnit of organizationalUnits) {
    const accountsInOu = await organizations.listAccountsForParent(organizationalUnit.Id!);
    const acceleratorAccountsInOu = accounts.filter(account => account.organizationalUnit === organizationalUnit.Name);
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
    accounts,
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
