import * as org from 'aws-sdk/clients/organizations';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import {
  LoadConfigurationInput,
  ConfigurationAccount,
  ConfigurationOrganizationalUnit,
  LoadConfigurationOutput,
} from '../load-configuration-step';

export const handler = async (input: LoadConfigurationInput): Promise<LoadConfigurationOutput> => {
  console.log(`Loading Organization baseline configuration...`);
  console.log(JSON.stringify(input, null, 2));

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

  // Verify that AWS Account and Accelerator config have the same OUs
  const acceleratorOuConfigs = config['organizational-units'];
  const acceleratorOus = Object.keys(acceleratorOuConfigs);
  for (const acceleratorOu of acceleratorOus) {
    const awsOu = awsOus.find(ou => ou.Name === acceleratorOu);
    if (!awsOu) {
      errors.push(`Cannot find organizational unit "${acceleratorOu}" that is used by Accelerator`);
      continue;
    }

    configurationOus.push({
      ouId: awsOu.Id!,
      ouName: awsOu.Name!,
      ouKey: acceleratorOu,
    });
  }

  // First load mandatory accounts configuration
  const mandatoryAccounts = config.getMandatoryAccountConfigs();
  const mandatoryAccountKeys = mandatoryAccounts.map(([accountKey, _]) => accountKey);

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const accountConfigName = accountConfig['account-name'];
    const accountConfigEmail = accountConfig.email;

    // Find the organizational account used by this
    const organizationalUnitName = accountConfig.ou;
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
    }

    configurationAccounts.push({
      accountId: account?.Id,
      accountKey,
      accountName: accountConfigName,
      emailAddress: accountConfig.email,
      organizationalUnit: organizationalUnitName,
      isMandatoryAccount: mandatoryAccountKeys.includes(accountKey),
    });
  }

  // Verify if there are additional accounts in the OU that are not managed by Accelerator
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
