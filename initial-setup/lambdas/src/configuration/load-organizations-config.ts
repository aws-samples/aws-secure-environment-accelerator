import * as org from 'aws-sdk/clients/organizations';
import { Organizations, OrganizationalUnit } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import {
  LoadConfigurationInput,
  ConfigurationAccount,
  ConfigurationOrganizationalUnit,
  LoadConfigurationOutput,
} from '../load-configuration-step';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';

interface LoadOrganizationConfigurationOutput extends LoadConfigurationOutput {
  installCloudFormationMasterRole?: boolean;
}

// Using sts  getCallerIdentity() to get account nunber
const sts = new STS();
const organizations = new Organizations();

export const handler = async (input: LoadConfigurationInput): Promise<LoadOrganizationConfigurationOutput> => {
  console.log(`Loading Organization baseline configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const { configFilePath, configRepositoryName, configCommitId } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const accountIdentity = await sts.getCallerIdentity();
  const masterAccountId = accountIdentity.Account;
  const masterAccount = await organizations.getAccount(masterAccountId!);

  // Find OUs and accounts in AWS account
  const awsOus = await organizations.listOrganizationalUnits();
  const awsOuAccountMap: { [ouId: string]: org.Account[] } = {};

  // Store the accounts in a simple list as well
  const awsAccounts: org.Account[] = await organizations.listAccounts();

  // Store organizational units and their accounts
  for (const organizationalUnit of awsOus) {
    const ouId = organizationalUnit.Id!;
    const accountsInOu = await organizations.listAccountsForParent(ouId);

    // Associate accounts to organizational unit
    awsOuAccountMap[ouId] = accountsInOu;
  }

  const awsOusWithPath: OrganizationalUnit[] = [];
  for (const awsOu of awsOus) {
    awsOusWithPath.push(await organizations.getOrganizationalUnitWithPath(awsOu.Id!));
  }

  const ignoredOus = config['global-options']['ignored-ous'] || [];
  const ignoredOuIds: string[] = [];
  for (const ignoredOu of ignoredOus) {
    ignoredOuIds.push(...awsOusWithPath.filter(ou => ou.Name === ignoredOu).map(o => o.Id!));
  }

  console.log(`Found organizational units:`);
  console.log(JSON.stringify(awsOusWithPath, null, 2));

  // Keep track of errors and warnings instead of failing immediately
  const errors = [];
  const warnings: string[] = [];

  // Store the discovered accounts and OUs in these objects
  const configurationAccounts: ConfigurationAccount[] = [];
  const accountsInIgnoredOus: ConfigurationAccount[] = [];
  const configurationOus: ConfigurationOrganizationalUnit[] = [];

  // -------------------------------- \\
  // VERIFY ACCELERATOR CONFIGURATION \\
  // -------------------------------- \\

  // Verify that AWS Account and Accelerator config have the same OUs
  const acceleratorOuConfigs = config['organizational-units'];
  const acceleratorOus = Object.keys(acceleratorOuConfigs);
  for (const acceleratorOu of acceleratorOus) {
    const awsOu = awsOusWithPath.find(ou => ou.Name === acceleratorOu && ou.Path === acceleratorOu);
    if (!awsOu) {
      errors.push(`Cannot find organizational unit "${acceleratorOu}" that is used by Accelerator`);
      continue;
    }
    configurationOus.push({
      ouId: awsOu.Id!,
      ouName: awsOu.Name!,
      ouKey: acceleratorOu,
      ouPath: awsOu.Path,
    });
  }
  const workLoadOuConfigs = config.getWorkloadAccountConfigs();
  const workLoadOus = workLoadOuConfigs.map(([_, wc]) => wc['ou-path'] || wc.ou);
  for (const acceleratorOu of workLoadOus) {
    if (configurationOus.find(co => co.ouPath === acceleratorOu)) {
      // Skipp as it is already added in organizational-units
      continue;
    }
    let awsOu = awsOusWithPath.find(ou => ou.Path === acceleratorOu);
    if (!awsOu) {
      awsOu = awsOusWithPath.find(ou => ou.Name === acceleratorOu);
    }
    if (!awsOu) {
      errors.push(`Cannot find organizational unit "${acceleratorOu}" that is used by Accelerator`);
      continue;
    }
    configurationOus.push({
      ouId: awsOu.Id!,
      ouName: awsOu.Name!,
      ouKey: acceleratorOu,
      ouPath: awsOu.Path,
    });
  }
  console.log(`Found organizational units in Configuration from both OrganizationalUnits and WorkLoadAccounts:`);
  console.log(JSON.stringify(configurationOus, null, 2));

  // First load mandatory accounts configuration
  const mandatoryAccounts = config.getMandatoryAccountConfigs();
  const mandatoryAccountKeys = mandatoryAccounts.map(([accountKey, _]) => accountKey);

  // Validate Master Accoung email
  const masterAccountConfig = mandatoryAccounts.find(([accountKey, _]) => accountKey === 'master');
  if (!masterAccountConfig) {
    throw new Error(`Cannot find a Master Account in Configuration`);
  }

  if (masterAccountConfig[1].email !== masterAccount?.Email) {
    throw new Error(`Invalid Master account email "${masterAccountConfig[1].email}" found in configuration`);
  }

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const accountConfigName = accountConfig['account-name'];
    const accountConfigEmail = accountConfig.email;

    // Find the organizational account used by this
    const organizationalUnitName = accountConfig.ou;
    const organizationalUnitPath = accountConfig['ou-path'] || organizationalUnitName;
    let organizationalUnit = awsOusWithPath.find(ou => ou.Path === organizationalUnitPath);
    if (!organizationalUnit) {
      organizationalUnit = awsOusWithPath.find(ou => ou.Name === organizationalUnitName);
    }
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
    }

    if (ignoredOus.includes(organizationalUnit.Name!)) {
      // Accounts under ignoredOus
      accountsInIgnoredOus.push({
        accountId: account?.Id,
        accountKey,
        accountName: accountConfigName,
        emailAddress: accountConfig.email,
        organizationalUnit: organizationalUnitName,
        isMandatoryAccount: mandatoryAccountKeys.includes(accountKey),
        ouPath: organizationalUnitPath,
      });
    }

    configurationAccounts.push({
      accountId: account?.Id,
      accountKey,
      accountName: accountConfigName,
      emailAddress: accountConfig.email,
      organizationalUnit: organizationalUnitName,
      isMandatoryAccount: mandatoryAccountKeys.includes(accountKey),
      ouPath: organizationalUnitPath,
    });
  }

  // Verify if there are additional accounts in the OU that are not managed by Accelerator
  for (const organizationalUnit of awsOusWithPath) {
    const accountsInOu = awsOuAccountMap[organizationalUnit.Id!];
    if (ignoredOuIds.includes(organizationalUnit.Id!)) {
      continue;
    }
    const acceleratorAccountsInOu = configurationAccounts.filter(account => account.ouPath === organizationalUnit.Path);
    if (accountsInOu.length !== acceleratorAccountsInOu.length) {
      warnings.push(
        `There are ${accountsInOu.length} accounts in OU "${organizationalUnit.Path}" while there are only ` +
          `${acceleratorAccountsInOu.length} accounts in the Accelerator configuration\n` +
          `  Accounts in OU:     ${accountsInOu.map(a => a.Name).join(', ')}\n` +
          `  Accounts in config: ${acceleratorAccountsInOu.map(a => a.accountName).join(', ')}\n`,
      );
    }
  }

  if (accountsInIgnoredOus.length > 0) {
    errors.push(
      `There are ${accountsInIgnoredOus.length} accounts under ignored OUs which is in configuration ` +
        `  Accounts in config: ${accountsInIgnoredOus.map(a => a.accountName).join(', ')}\n`,
    );
  }
  errors.push(...validateOrganizationSpecificConfiguration(config));
  // Throw all errors at once
  if (errors.length > 0) {
    throw new Error(`There were errors while loading the configuration:\n${errors.join('\n')}`);
  }

  const installCloudFormationMasterRole = config['global-options']['install-cloudformation-master-role'];

  return {
    ...input,
    organizationalUnits: configurationOus,
    accounts: configurationAccounts,
    warnings,
    installCloudFormationMasterRole,
  };
};

function validateOrganizationSpecificConfiguration(config: AcceleratorConfig): string[] {
  const errors: string[] = [];
  if (!config['global-options']['iam-password-policies']) {
    errors.push(`Did not find "global-options/iam-password-policies" in Accelerator Configuration`);
  }
  if (!config['global-options']['organization-admin-role']) {
    errors.push(`Did not find "global-options/organization-admin-role" in Accelerator Configuration`);
  }
  return errors;
}
