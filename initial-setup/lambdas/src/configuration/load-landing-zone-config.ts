import * as org from 'aws-sdk/clients/organizations';
import { LandingZoneAccountType, LANDING_ZONE_ACCOUNT_TYPES } from '@aws-pbmm/common-lambda/lib/config';
import { LandingZone } from '@aws-pbmm/common-lambda/lib/landing-zone';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { SSM } from '@aws-pbmm/common-lambda/lib/aws/ssm';
import { arrayEqual } from '@aws-pbmm/common-lambda/lib/util/arrays';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import {
  LoadConfigurationInput,
  ConfigurationAccount,
  ConfigurationOrganizationalUnit,
  LoadConfigurationOutput,
} from '../load-configuration-step';

export const handler = async (input: LoadConfigurationInput): Promise<LoadConfigurationOutput> => {
  console.log(`Loading configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const landingZone = new LandingZone();
  const landingZoneStack = await landingZone.findLandingZoneStack();
  if (!landingZoneStack) {
    throw new Error(`Cannot find a Landing Zone stack in your account`);
  }
  console.log(`Detected Landing Zone stack with version "${landingZoneStack.version}"`);

  const { configFilePath, configRepositoryName, configCommitId } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const organizations = new Organizations();

  // Find OUs and accounts in AWS account
  const awsOus = await organizations.listOrganizationalUnits();
  const awsOuAccountMap: { [ouId: string]: org.Account[] } = {};
  const awsAccounts: org.Account[] = [];

  // Store organizational units and their accounts
  for (const organizationalUnit of awsOus) {
    const ouId = organizationalUnit.Id!;
    const accountsInOu = await organizations.listAccountsForParent(ouId);

    // Associate accounts to organizational unit
    awsOuAccountMap[ouId] = accountsInOu;

    // Store the accounts in a simple list as well
    awsAccounts.push(...accountsInOu);
  }

  console.log(`Found organizational units:`);
  console.log(JSON.stringify(awsOus, null, 2));

  // Keep track of errors and warnings instead of failing immediately
  const errors = [];
  const warnings = [];

  // Store the discovered accounts and OUs in these objects
  const configurationAccounts: ConfigurationAccount[] = [];
  const configurationOus: ConfigurationOrganizationalUnit[] = [];

  // -------------------------------- \\
  // VERIFY ACCELERATOR CONFIGURATION \\
  // -------------------------------- \\

  // Verify that Landing Zone and Accelerator config have the same OUs
  const acceleratorOuConfigs = config['organizational-units'];
  const acceleratorOus = Object.keys(acceleratorOuConfigs);
  for (const acceleratorOu of acceleratorOus) {
    const awsOu = awsOus.find(ou => ou.Name === acceleratorOu);
    if (!awsOu) {
      errors.push(`Cannot find organizational unit "${acceleratorOu}" that is used by Accelerator`);
      continue;
    }
    const awsOuWithPath = await organizations.getOrganizationalUnitWithPath(awsOu.Id!);

    configurationOus.push({
      ouId: awsOu.Id!,
      ouName: awsOu.Name!,
      ouKey: acceleratorOu,
      ouPath: awsOuWithPath.Path,
    });
  }

  // First load mandatory accounts configuration
  const mandatoryAccounts = config.getMandatoryAccountConfigs();
  const mandatoryAccountKeys = mandatoryAccounts.map(([accountKey, _]) => accountKey);

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const accountConfigName = accountConfig['account-name'];
    const accountConfigEmail = accountConfig.email;
    const landingZoneAccountType = accountConfig['landing-zone-account-type'];

    // Find the organizational account used by this
    const organizationalUnitName = accountConfig.ou;
    const organizationalUnitPath = accountConfig['ou-path'] || organizationalUnitName;
    const organizationalUnit = awsOus.find(ou => ou.Name === organizationalUnitName);
    if (!organizationalUnit) {
      errors.push(`Cannot find organizational unit "${accountConfig.ou}" that is used by Accelerator`);
      continue;
    }

    const account = awsAccounts.find(a => a.Email === accountConfigEmail);
    if (account) {
      const accountsInOu = awsOuAccountMap[organizationalUnit.Id!];
      const accountInOu = accountsInOu?.find(a => a.Id === account.Id);
      if (!accountInOu) {
        errors.push(`The account with name "${accountConfigName}" is not in OU "${organizationalUnitName}".`);
        continue;
      }
      if (landingZoneAccountType !== 'primary' && account.Name !== accountConfigName) {
        errors.push(
          `The account name for account with email "${accountConfigEmail}" does not match the name in the Accelerator configuration.\n` +
            `"${account.Name}" != "${accountConfigName}"`,
        );
        continue;
      }
    } else if (landingZoneAccountType) {
      errors.push(`Cannot find Landing Zone account of type ${landingZoneAccountType} in the organization.`);
      continue;
    }

    configurationAccounts.push({
      accountId: account?.Id,
      accountKey,
      accountName: accountConfigName,
      emailAddress: accountConfig.email,
      organizationalUnit: organizationalUnitName,
      isMandatoryAccount: mandatoryAccountKeys.includes(accountKey),
      landingZoneAccountType,
      ouPath: organizationalUnitPath,
    });
  }

  // --------------------------------- \\
  // VERIFY LANDING ZONE CONFIGURATION \\
  // --------------------------------- \\

  // Check if there are additional OUs that are not managed by Landing Zone
  const lzOrganizationalUnits = landingZoneStack.config.organizational_units;
  if (awsOus.length !== lzOrganizationalUnits.length) {
    warnings.push(
      `There are ${awsOus.length} organizational units in the organization while there are only ` +
        `${lzOrganizationalUnits.length} organizational units in the Landing Zone configuration\n` +
        `  Organizational units in organization: ${awsOus.map(ou => ou.Name).join(', ')}\n` +
        `  Organizational units in Landing Zone: ${lzOrganizationalUnits.map(ou => ou.name).join(', ')}\n`,
    );
  }

  const lzOus = lzOrganizationalUnits.map(ou => ou.name);
  if (!arrayEqual(acceleratorOus, lzOus)) {
    errors.push(
      `There are ${acceleratorOus.length} organizational units in Accelerator configuration while there are only ` +
        `${lzOus.length} organizational units in the Landing Zone configuration\n` +
        `  Organizational units in Accelerator:  ${acceleratorOus.join(', ')}\n` +
        `  Organizational units in Landing Zone: ${lzOus.join(', ')}\n`,
    );
  }

  // Verify that AWS organizations is not missing an Accel_config or an ALZ_config ou
  const awsOuNames = awsOus.map(ou => ou.Name);
  if (lzOus.some(ou => !awsOuNames.includes(ou))) {
    errors.push(
      `There are missing OUs found in Landing Zone configuration but not in AWS Organization\n` +
        ` Organizational units in Landing Zone: ${lzOus.join(', ')}\n` +
        ` Organizational units in AWS Organizations: ${awsOuNames.join(', ')}\n`,
    );
  }

  // Next we verify if the Landing Zone account configuration matches the Accelerator account configuration
  for (const lzOrganizationalUnit of lzOrganizationalUnits) {
    const lzOrganizationalUnitName = lzOrganizationalUnit.name;
    if (!lzOrganizationalUnit.core_accounts) {
      continue;
    }

    const organizationalUnit = awsOus.find(ou => ou.Name === lzOrganizationalUnitName);
    if (!organizationalUnit) {
      errors.push(`Cannot find organizational unit "${lzOrganizationalUnitName}" that is used by Landing Zone`);
      continue;
    }

    const accountsInOu = awsOuAccountMap[organizationalUnit.Id!];

    for (const lzAccount of lzOrganizationalUnit.core_accounts) {
      const lzAccountType = getLandingZoneAccountTypeBySsmParameters(lzAccount.ssm_parameters);
      if (!lzAccountType) {
        errors.push(`Cannot detect Landing Zone account type for account with name "${lzAccount.name}"`);
        continue;
      }

      if (lzAccountType !== 'primary') {
        // If the account is a non-primary account, then look for it by its name
        const account = accountsInOu.find(a => a.Name === lzAccount.name);
        if (!account) {
          errors.push(`Cannot find non-primary account with name "${lzAccount.name}" that is used by Landing Zone`);
          continue;
        }
      }

      const acceleratorAccount = configurationAccounts.find(a => a.landingZoneAccountType === lzAccountType);
      if (!acceleratorAccount) {
        errors.push(`Cannot find Landing Zone account of type ${lzAccountType} in the Accelerator configuration`);
        continue;
      }

      const lzAccountEmail =
        lzAccount.email || (await getLandingZoneAccountEmailBySsmParameters(lzAccount.ssm_parameters));
      // When we find configuration for this account in the Accelerator config, then verify if properties match for non-primary accounts
      if (
        acceleratorAccount.accountName !== lzAccount.name &&
        acceleratorAccount.landingZoneAccountType !== 'primary'
      ) {
        errors.push(
          `The Acceleror account name and Landing Zone account name for account type "${lzAccountType}" do not match.\n` +
            `"${acceleratorAccount.accountName}" != "${lzAccount.name}"`,
        );
      }

      // Only validate email address and OU for mandatory accounts
      if (acceleratorAccount.emailAddress !== lzAccountEmail) {
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
  }

  // Verify if all Landing Zone accounts are there
  for (const landingZoneAccountType of LANDING_ZONE_ACCOUNT_TYPES) {
    const lzAccount = configurationAccounts.find(a => a.landingZoneAccountType === landingZoneAccountType);
    if (!lzAccount) {
      errors.push(`Could not find Landing Zone account of type "${landingZoneAccountType}"`);
    }
  }

  // Verify if there are additional accounts in the OU that are not managed by Landing Zone or Accelerator
  for (const organizationalUnit of awsOus) {
    const accountsInOu = awsOuAccountMap[organizationalUnit.Id!];
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
    ...input,
    organizationalUnits: configurationOus,
    accounts: configurationAccounts,
    warnings,
  };
};

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

async function getLandingZoneAccountEmailBySsmParameters(
  ssmParameters: { name: string; value: string }[],
): Promise<string | undefined> {
  const accountEmailParameter = ssmParameters.find(p => p.value === '$[AccountEmail]');
  if (!accountEmailParameter) {
    return undefined;
  }
  const ssm = new SSM();
  const response = await ssm.getParameter(accountEmailParameter.name);
  return response.Parameter?.Value;
}
