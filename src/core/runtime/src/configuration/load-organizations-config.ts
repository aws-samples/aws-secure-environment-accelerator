/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as org from 'aws-sdk/clients/organizations';
import { Organizations, OrganizationalUnit } from '@aws-accelerator/common/src/aws/organizations';
import { ServiceCatalog } from '@aws-accelerator/common/src/aws/service-catalog';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';
import {
  LoadConfigurationInput,
  ConfigurationAccount,
  ConfigurationOrganizationalUnit,
  LoadConfigurationOutput,
} from '../load-configuration-step';
import { AcceleratorConfig, AwsConfigAccountConfig } from '@aws-accelerator/common-config';
import { ServiceControlPolicy } from '../../../../lib/common/src/scp';
import { loadAccounts } from '../utils/load-accounts';
import { ProvisionedProductAttribute } from 'aws-sdk/clients/servicecatalog';

const MAX_SCPS_ALLOWED = 5;
interface LoadOrganizationConfigurationOutput extends LoadConfigurationOutput {
  installCloudFormationMasterRole?: boolean;
}

// Using sts  getCallerIdentity() to get account nunber
const sts = new STS();
const dynamoDB = new DynamoDB();
const organizations = new Organizations();
const servicecatalog = new ServiceCatalog();

export const handler = async (input: LoadConfigurationInput): Promise<LoadOrganizationConfigurationOutput> => {
  console.log(`Loading Organization baseline configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    configFilePath,
    configRepositoryName,
    configCommitId,
    acceleratorPrefix,
    parametersTableName,
    baseline,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const accountIdentity = await sts.getCallerIdentity();
  const masterAccountId = accountIdentity.Account;
  const masterAccount = await organizations.getAccount(masterAccountId!);
  const previousAccounts = await loadAccounts(parametersTableName, dynamoDB);

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

  const suspendedOuId = awsOusWithPath.find(ou => ou.Name === 'Suspended' && ou.Path === 'Suspended')?.Id!;

  console.log(`Found organizational units:`);
  console.log(JSON.stringify(awsOusWithPath, null, 2));

  // Keep track of errors and warnings instead of failing immediately
  const errors = [];
  const warnings: string[] = [];

  // Store the discovered accounts and OUs in these objects
  const configurationAccounts: ConfigurationAccount[] = [];
  const accountsInIgnoredOus: ConfigurationAccount[] = [];
  const accountsInSuspendedOu: ConfigurationAccount[] = [];
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
      // Skip as it is already added in organizational-units
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

  const masterAccountKey = config.getMandatoryAccountKey('master');
  // Validate Master Accoung email
  const masterAccountConfig = mandatoryAccounts.find(([accountKey, _]) => accountKey === masterAccountKey);
  if (!masterAccountConfig) {
    throw new Error(`Cannot find a Master Account in Configuration`);
  }

  if (!equalIgnoreCase(masterAccountConfig[1].email, masterAccount?.Email!)) {
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

    const account = awsAccounts.find(a => equalIgnoreCase(a.Email!, accountConfigEmail));
    if (account && account.Status === 'SUSPENDED') {
      const accountsInOu = awsOuAccountMap[suspendedOuId];
      const accountInOu = accountsInOu?.find(a => a.Id === account.Id);
      if (!accountInOu) {
        errors.push(`The account with name "${accountConfigName}" is not in OU "Suspended".`);
        continue;
      }
      accountsInSuspendedOu.push({
        accountId: account?.Id,
        accountKey,
        accountName: accountConfigName,
        emailAddress: accountConfig.email,
        organizationalUnit: organizationalUnitName,
        isMandatoryAccount: mandatoryAccountKeys.includes(accountKey),
        ouPath: organizationalUnitPath,
      });
    } else if (account) {
      const accountsInOu = awsOuAccountMap[organizationalUnit.Id!];
      const accountInOu = accountsInOu?.find(a => a.Id === account.Id);
      if (accountInOu?.Name !== accountConfig['account-name']) {
        errors.push(
          `${accountInOu?.Name} does not match the name in the Accelerator configuration ${accountConfig['account-name']}`,
        );
      }
      if (!accountInOu) {
        errors.push(`The account with name "${accountConfigName}" is not in OU "${organizationalUnitName}".`);
        continue;
      }
    } else {
      if (previousAccounts.find(acc => acc.key === accountKey)) {
        errors.push(`Invalid Account Configuration found for account ${accountKey}`);
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
    if (organizationalUnit.Id === suspendedOuId) {
      continue;
    }
    const acceleratorAccountsInOu = configurationAccounts.filter(account => account.ouPath === organizationalUnit.Path);
    if (accountsInOu.length > acceleratorAccountsInOu.length) {
      errors.push(
        `There are ${accountsInOu.length} accounts in OU "${organizationalUnit.Path}" while there are only ` +
          `${acceleratorAccountsInOu.length} accounts in the Accelerator configuration\n` +
          `  Accounts in OU:     ${accountsInOu.map(a => a.Name).join(', ')}\n` +
          `  Accounts in config: ${acceleratorAccountsInOu.map(a => a.accountName).join(', ')}\n`,
      );
    } else if (accountsInOu.length !== acceleratorAccountsInOu.length) {
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

  const serviceCatalogAccounts = await servicecatalog.searchProvisionedProductsForAllAccounts();
  // Add accounts that are in a failed state in Service Catalog to the error list
  if (baseline === 'CONTROL_TOWER') {
    const failedServiceCatalogAccounts = serviceCatalogAccounts.filter(function (currentElement) {
      return currentElement.Status === 'ERROR' || currentElement.Status === 'TAINTED';
    });
    for (const account of failedServiceCatalogAccounts) {
      errors.push(`The Control Tower account: ${account.Name} is in a failed state ${account.Status}`);
    }
  }

  errors.push(...validateOrganizationSpecificConfiguration(config));
  errors.push(...(await validateScpsCount(config, awsOus, configurationAccounts, acceleratorPrefix)));
  // Throw all errors at once
  if (errors.length > 0) {
    throw new Error(`There were errors while loading the configuration:\n${errors.join('\n')}`);
  }

  const installCloudFormationMasterRole = config['global-options']['install-cloudformation-master-role'];

  // if control tower is enabled determine which accounts need to be added via the account vending machine
  if (baseline === 'CONTROL_TOWER') {
    const filteredServiceCatalogAccounts = serviceCatalogAccounts.filter(function (currentElement) {
      return currentElement.Status === 'AVAILABLE';
    });
    console.log('Filtered service catalog accounts');
    console.log(JSON.stringify(filteredServiceCatalogAccounts, null, 2));

    const filteredConfigurationAccounts = configurationAccounts.filter(function (currentElement) {
      return (
        currentElement.accountKey !== 'management' &&
        currentElement.accountKey !== 'security' &&
        currentElement.accountKey !== 'log-archive'
      );
    });
    console.log('Filtered configuration accounts');
    console.log(JSON.stringify(filteredConfigurationAccounts, null, 2));

    // create the list of accounts that don't have an accountId. These are new accounts from the config file
    const accountsToCreate = configurationAccounts.filter(acc => !acc.accountId);
    console.log('Initial list of accounts to create');
    console.log(JSON.stringify(accountsToCreate, null, 2));

    // make a list of accountids that exist in service catalog
    const validServiceCatalogAccountIds = [];
    for (const account of filteredServiceCatalogAccounts) {
      validServiceCatalogAccountIds.push(account.PhysicalId);
    }
    console.log('Valid service catalog account ids');
    console.log(validServiceCatalogAccountIds);

    // add the accounts that do not exist in the list of service catalog accounts
    for (const account of filteredConfigurationAccounts) {
      if (account.accountId !== undefined && !validServiceCatalogAccountIds.includes(account.accountId)) {
        console.log(`Pushing account ${account.accountId}`);
        accountsToCreate.push(account);
      }
    }

    console.log('Accounts to create in Control Tower');
    console.log(JSON.stringify(accountsToCreate, null, 2));

    return {
      ...input,
      organizationalUnits: configurationOus,
      accounts: accountsToCreate,
      regions: config['global-options']['supported-regions'],
      warnings,
      installCloudFormationMasterRole,
    };
  }

  return {
    ...input,
    organizationalUnits: configurationOus,
    // Return Only accounts that are needed to be created
    accounts: configurationAccounts.filter(acc => !acc.accountId),
    regions: config['global-options']['supported-regions'],
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

async function validateScpsCount(
  config: AcceleratorConfig,
  ous: org.OrganizationalUnit[],
  accounts: ConfigurationAccount[],
  acceleratorPrefix: string,
): Promise<string[]> {
  const errors: string[] = [];
  for (const [oukey, ouConfig] of config.getOrganizationalUnits()) {
    const ouObject = ous.find(o => o.Name === oukey);
    if (!ouObject) {
      console.warn(`OU "${oukey}" doesn't exist in Account`);
      continue;
    }
    const attachedScps = await organizations.listPoliciesForTarget({
      Filter: 'SERVICE_CONTROL_POLICY',
      TargetId: ouObject.Id!,
    });
    const accelOuScps = ouConfig.scps.map(policyName =>
      ServiceControlPolicy.policyNameToAcceleratorPolicyName({ acceleratorPrefix, policyName }),
    );
    const configScps = config['global-options'].scps;
    const accelScps = configScps.map(scp =>
      ServiceControlPolicy.policyNameToAcceleratorPolicyName({
        acceleratorPrefix,
        policyName: scp.name,
      }),
    );
    const nonAccelScps = attachedScps.filter(as => !accelScps.includes(as.Name!));
    if (nonAccelScps.length + accelOuScps.length > MAX_SCPS_ALLOWED) {
      errors.push(
        `Max Allowed SCPs for OU "${oukey}" is ${MAX_SCPS_ALLOWED}, found already attached scps count ${nonAccelScps.length} and Accelerator OU scps ${accelOuScps.length} => ${accelOuScps}`,
      );
    }
  }

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const accountObject = accounts.find(acc => acc.accountKey === accountKey);
    if (!accountObject || !accountObject.accountId) {
      console.warn(`Account "${accountKey}" doesn't exist in Organizations`);
      continue;
    }
    const attachedScps = await organizations.listPoliciesForTarget({
      Filter: 'SERVICE_CONTROL_POLICY',
      TargetId: accountObject.accountId,
    });
    const configScps = config['global-options'].scps;
    const accelScps = configScps.map(scp =>
      ServiceControlPolicy.policyNameToAcceleratorPolicyName({
        acceleratorPrefix,
        policyName: scp.name,
      }),
    );
    const accelAccountScps: string[] =
      accountConfig.scps?.map(policyName =>
        ServiceControlPolicy.policyNameToAcceleratorPolicyName({ acceleratorPrefix, policyName }),
      ) || [];
    const nonAccelScps = attachedScps.filter(as => !accelScps.includes(as.Name!));
    if (nonAccelScps.length + accelAccountScps.length > MAX_SCPS_ALLOWED) {
      errors.push(
        `Max Allowed SCPs for Account "${accountKey}" is ${MAX_SCPS_ALLOWED}, found already attached scps count ${nonAccelScps.length} and Accelerator scps ${accelAccountScps.length} => ${accelAccountScps}`,
      );
    }
  }

  return errors;
}
