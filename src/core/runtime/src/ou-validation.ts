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
import { AcceleratorConfig, AcceleratorUpdateConfig, AccountsConfig } from '@aws-accelerator/common-config/src';
import { ServiceControlPolicy, FULL_AWS_ACCESS_POLICY_NAME } from '@aws-accelerator/common/src/scp';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { OrganizationalUnit as ConfigOrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';
import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { LoadConfigurationInput } from './load-configuration-step';
import { FormatType, pretty } from '@aws-accelerator/common/src/util/prettier';
import { getFormattedObject, getStringFromObject, equalIgnoreCase } from '@aws-accelerator/common/src/util/common';
import { JSON_FORMAT, YAML_FORMAT } from '@aws-accelerator/common/src/util/constants';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getItemInput } from './utils/dynamodb-requests';

const SUSPENDED_OU_NAME = 'Suspended';

export interface ValdationInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  acceleratorName: string;
  region: string;
  parametersTableName: string;
  organizationsItemId: string;
  accountsItemId: string;
  configBranch: string;
}

const organizations = new Organizations();
const dynamoDB = new DynamoDB();
const codecommit = new CodeCommit();

/**
 *
 * @param input ValdationInput
 * - (ORGANIZATIONS, CONTROL_TOWER) Check for renamed accounts and update in codecommit config file
 * - (ORGANIZATIONS, CONTROL_TOWER) Check for renamed Organizations and update in codecommit config file
 * - (ORGANIZATIONS) Check for non created OUs in config file and create OUs
 * - (ORGANIZATIONS) Create Suspended OU and move all suspended accounts to it
 * - (ORGANIZATIONS, CONTROL_TOWER) Attach QNO Scp to all free accounts under root and Suspended OU
 * - (ORGANIZATIONS, CONTROL_TOWER) Validating SCP Count and throw error if max SCPs count exceeds 5 on either accounts or orgs
 */
export const handler = async (input: ValdationInput): Promise<string> => {
  console.log(`Performing OU Validation...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    configFilePath,
    configRepositoryName,
    configCommitId,
    acceleratorPrefix,
    parametersTableName,
    organizationsItemId,
    accountsItemId,
    configBranch,
    configRootFilePath,
    acceleratorName,
    region,
    baseline,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  // Reading directly from CodeCommit because of cidr objects
  const configCommit = await codecommit.getFile(configRepositoryName, configFilePath, configCommitId);
  const previousConfigString = configCommit.fileContent.toString();
  const previousConfig = JSON.parse(previousConfigString);

  const rootConfigString = await getConfigFromCodeCommit(configRepositoryName, configCommitId, configRootFilePath!);
  const extension = configRootFilePath?.split('.').slice(-1)[0];
  const format = extension === JSON_FORMAT ? JSON_FORMAT : YAML_FORMAT;
  let rootConfig = getFormattedObject(rootConfigString, format);

  let config = previousConfig;
  const previousAccounts = await loadAccounts(parametersTableName, accountsItemId);
  const previousOrganizationalUnits = await loadOrganizations(parametersTableName, organizationsItemId);
  const organizationAdminRole = config['global-options']['organization-admin-role'];
  const scps = new ServiceControlPolicy({
    client: organizations,
    acceleratorPrefix,
    acceleratorName,
    region,
    replacements: config.replacements,
    organizationAdminRole,
  });

  // Find OUs and accounts in AWS account
  const awsOus = await organizations.listOrganizationalUnits();

  const awsOuAccountMap: { [ouId: string]: org.Account[] } = {};
  const awsAccounts: org.Account[] = [];
  const awsOusWithPath: OrganizationalUnit[] = [];
  for (const awsOu of awsOus) {
    awsOusWithPath.push(await organizations.getOrganizationalUnitWithPath(awsOu.Id!));
  }

  for (const organizationalUnit of awsOusWithPath) {
    const ouId = organizationalUnit.Id!;
    const accountsInOu = await organizations.listAccountsForParent(ouId);

    // Associate accounts to organizational unit
    awsOuAccountMap[ouId] = accountsInOu;

    // Store the accounts in a simple list as well
    awsAccounts.push(...accountsInOu);
  }

  // change config based on rename Accounts
  const updateAccountResponse = updateRenamedAccounts({
    config,
    previousAccounts,
    awsAccounts,
  });

  // change config based on rename Accounts
  const suspendedAccountsResponse = updateSuspendedAccounts({
    config: updateAccountResponse.config,
    awsAccounts,
    updatedAccounts: updateAccountResponse.updatedAccounts,
  });

  config = suspendedAccountsResponse.config;

  // change config based on rename Organizational Units
  const updateOrgResponse = await updateRenamedOrganizationalUnits({
    config,
    previousOrganizationalUnits,
    awsOus: awsOusWithPath,
    rootConfigString,
    format,
    updatedAccounts: suspendedAccountsResponse.updatedAccounts,
  });
  config = updateOrgResponse.config;
  rootConfig = getFormattedObject(updateOrgResponse.rootConfig, format);
  // Update Config from 'updateRenamedAccouns' and 'updateRenamedOrganizations'
  const updatedAccounts = updateOrgResponse.updatedAccounts;
  const updateAccountFilenames = [...new Set(Object.entries(updatedAccounts).map(([_, accInfo]) => accInfo.filename))];
  const updateFiles: { filePath: string; fileContent: string }[] = [];

  updateAccountFilenames.map(async filename => {
    console.log(`Update Config required in file "${filename}"`);
    const accountsInFile = Object.entries(updatedAccounts).filter(([_, accInfo]) => accInfo.filename === filename);
    if (filename === configRootFilePath) {
      for (const [accKey, accountInFile] of accountsInFile) {
        if (accountInFile.type === 'mandatory') {
          rootConfig['mandatory-account-configs'][accKey] = updateAccountConfig(
            rootConfig['mandatory-account-configs'][accKey],
            accountInFile,
          );
        } else {
          rootConfig['workload-account-configs'][accKey] = updateAccountConfig(
            rootConfig['workload-account-configs'][accKey],
            accountInFile,
          );
        }
      }
    } else {
      const accountResponse = await codecommit.getFile(configRepositoryName, filename, configBranch);
      const accountObject = getFormattedObject(accountResponse.fileContent.toString(), format);
      for (const [accKey, accountInFile] of accountsInFile) {
        accountObject[accKey] = updateAccountConfig(accountObject[accKey], accountInFile);
      }
      updateFiles.push({
        filePath: filename,
        fileContent: pretty(getStringFromObject(accountObject, format), format),
      });
    }
  });

  [
    {
      filePath: configRootFilePath!,
      content: rootConfig,
      format,
    },
    {
      filePath: configFilePath,
      content: config,
      // Raw Config file alway be "json" irrespective of Configuration Format
      format: JSON_FORMAT,
    },
  ].map(c => {
    updateFiles.push({
      filePath: c.filePath,
      fileContent: pretty(getStringFromObject(c.content, c.format as FormatType), c.format as FormatType),
    });
  });
  let latestCommitId = '';
  try {
    console.log(`Updating Configuration in Code Commit`);
    latestCommitId = await codecommit.commit({
      branchName: configBranch,
      repositoryName: configRepositoryName,
      commitMessage: 'Updating through Ou-Validation Operation (Handling Renamed Accounts and Renamed Organizations)',
      putFiles: updateFiles,
      parentCommitId: configCommitId,
    });
  } catch (error) {
    if (error.code === 'NoChangeException') {
      console.log(`No Change in Configuration form Previous Execution`);
    } else {
      throw new Error(error);
    }
  }

  const roots = await organizations.listRoots();
  const rootId = roots[0].Id!;
  if (baseline === 'ORGANIZATIONS') {
    awsOusWithPath.push(...(await createOrganizstionalUnits(config, awsOusWithPath, rootId)));
  }
  const rootAccounts = await organizations.listAccountsForParent(rootId);
  let rootAccountIds = rootAccounts.map(acc => acc.Id);

  // Loading AcceleratorConfig Object from updated config Object
  const acceleratorConfig = AcceleratorConfig.fromObject(config);
  // First load mandatory accounts configuration
  const mandatoryAccounts = acceleratorConfig.getMandatoryAccountConfigs();
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const masterAccountConfig = mandatoryAccounts.find(([accKey, _]) => accKey === masterAccountKey);
  if (!masterAccountConfig) {
    throw new Error(`Cannot find a Master Account in Configuration`);
  }

  const rootMasterAccount = rootAccounts.find(acc => equalIgnoreCase(acc.Email!, masterAccountConfig[1].email));
  if (rootMasterAccount) {
    const masterConfigOu = masterAccountConfig[1]['ou-path'] || masterAccountConfig[1].ou;
    console.warn(`Master Account is under ROOT ogranization, Moving to ${masterConfigOu}`);

    let masterAccountOu = awsOusWithPath.find(ou => ou.Path === masterConfigOu);
    if (!masterAccountOu) {
      masterAccountOu = awsOusWithPath.find(ou => ou.Name === masterConfigOu);
    }
    if (!masterAccountOu) {
      console.error(`Cannot find organizational unit "${masterConfigOu}" that is used by Accelerator`);
    } else {
      await organizations.moveAccount({
        AccountId: rootMasterAccount?.Id!,
        DestinationParentId: masterAccountOu.Id!,
        SourceParentId: rootId,
      });
      rootAccountIds = rootAccountIds.filter(acc => acc !== rootMasterAccount?.Id!);
    }
  }
  let suspendedOu = awsOusWithPath.find(o => o.Path === SUSPENDED_OU_NAME);
  if (!suspendedOu && baseline === 'ORGANIZATIONS') {
    suspendedOu = await createSuspendedOu(SUSPENDED_OU_NAME, rootId);
    awsOusWithPath.push(suspendedOu);
  }

  // List Suspended Accounts
  for (const [ouId, accounts] of Object.entries(awsOuAccountMap)) {
    const suspendedAccounts = accounts.filter(account => account.Status === 'SUSPENDED');
    if (suspendedAccounts.length > 0 && !suspendedOu) {
      throw new Error(`There are Suspended accounts in Organization and no "Suspended" OU Created`);
    }
    for (const suspendedAccount of suspendedAccounts) {
      if (ouId === suspendedOu?.Id) {
        continue;
      }
      await organizations.moveAccount({
        AccountId: suspendedAccount.Id!,
        DestinationParentId: suspendedOu?.Id!,
        SourceParentId: ouId,
      });
    }
  }
  // Attach Qurantine SCP to root Accounts
  const policyId = await scps.createOrUpdateQuarantineScp();
  // Detach target from all polocies except FullAccess and Qurantine SCP
  for (const targetId of [...rootAccountIds, suspendedOu?.Id!]) {
    if (!targetId) {
      continue;
    }
    await scps.detachPoliciesFromTargets({
      policyNamesToKeep: [
        ServiceControlPolicy.createQuarantineScpName({ acceleratorPrefix }),
        FULL_AWS_ACCESS_POLICY_NAME,
      ],
      policyTargetIdsToInclude: [targetId],
      baseline,
    });
  }
  const policyTargets = await organizations.listTargetsForPolicy({
    PolicyId: policyId,
  });
  const existingTargets = policyTargets.map(target => target.TargetId);
  const targetIds = rootAccountIds.filter(targetId => !existingTargets.includes(targetId));
  if (suspendedOu && !existingTargets.includes(suspendedOu.Id)) {
    targetIds.push(suspendedOu?.Id);
  }
  for (const targetId of targetIds) {
    await organizations.attachPolicy(policyId, targetId!);
  }

  // Apply the QNO SCP to all top-level OU's not defined in the configuration file (removing all other SCP's except the default FullAccess SCP)
  // Remove the QNO SCP from all top-level OU's properly defined in the configuration file
  const updatedTargetsForQnoScp = await organizations.listTargetsForPolicy({
    PolicyId: policyId,
  });
  const updatedTargetIdsForQnoScp = updatedTargetsForQnoScp.map(t => t.TargetId);
  const rootOusInAccount = awsOusWithPath.filter(awsOu => awsOu.Name === awsOu.Path);
  const configOrgUnitNames = Object.keys(config['organizational-units']);
  const ignoredRootOus = config['global-options']['ignored-ous'] || [];
  for (const rootOrg of rootOusInAccount) {
    if (ignoredRootOus.includes(rootOrg.Name!)) {
      // Organization is specified in Ignored OUS, Nothing to perform
      // console.log(`Ignoring, Since Organization "${rootOrg.Name}" is specified in IgnoredOus list`);
    } else if (configOrgUnitNames.includes(rootOrg.Name!)) {
      // Organization is exists in Configuration, Detach QNO SCP if exists
      if (updatedTargetIdsForQnoScp.includes(rootOrg.Id)) {
        await organizations.detachPolicy(policyId, rootOrg.Id!);
      }
    } else {
      // Organization doesn't exist in Configuration attach QNO SCP
      await scps.detachPoliciesFromTargets({
        policyNamesToKeep: [
          ServiceControlPolicy.createQuarantineScpName({ acceleratorPrefix }),
          FULL_AWS_ACCESS_POLICY_NAME,
        ],
        policyTargetIdsToInclude: [rootOrg.Id!],
        baseline,
      });
      if (!updatedTargetIdsForQnoScp.includes(rootOrg.Id)) {
        await organizations.attachPolicy(policyId, rootOrg.Id!);
      }
    }
  }
  return latestCommitId || configCommitId;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function updateAccountConfig(accountConfig: any, accountInfo: UpdateAccountOutput) {
  if (accountInfo.email) {
    accountConfig.email = accountInfo.email;
  }
  if (accountInfo.name) {
    accountConfig['account-name'] = accountInfo.name;
  }
  if (accountInfo.ou) {
    accountConfig.ou = accountInfo.ou;
  }
  if (accountInfo['ou-path']) {
    accountConfig['ou-path'] = accountInfo['ou-path'];
  }
  accountConfig.deleted = accountInfo.deleted;
  return accountConfig;
}
async function loadAccounts(tableName: string, itemId: string): Promise<Account[]> {
  let index = 0;
  const accounts: Account[] = [];
  while (true) {
    const item = await dynamoDB.getItem(getItemInput(tableName, `${itemId}/${index}`));
    if (!item.Item) {
      break;
    }
    accounts.push(...JSON.parse(item.Item.value.S!));
    index++;
  }
  return accounts;
}

async function loadOrganizations(tableName: string, itemId: string): Promise<ConfigOrganizationalUnit[]> {
  const organizationalUnits: ConfigOrganizationalUnit[] = [];
  const organizationsOutput = await dynamoDB.getItem(getItemInput(tableName, itemId));
  if (!organizationsOutput.Item) {
    return organizationalUnits;
  }
  return JSON.parse(organizationsOutput.Item.value.S!);
}

interface UpdateAccountsOutput {
  [accountKey: string]: UpdateAccountOutput;
}

interface UpdateAccountOutput {
  name?: string;
  email?: string;
  filename: string;
  ou?: string;
  'ou-path'?: string;
  type: 'mandatory' | 'workload';
  deleted?: boolean;
}

const updateRenamedAccounts = (props: {
  config: AcceleratorUpdateConfig;
  previousAccounts: Account[];
  awsAccounts: org.Account[];
}): {
  config: AcceleratorConfig;
  updatedAccounts: UpdateAccountsOutput;
} => {
  const { awsAccounts, config, previousAccounts } = props;
  // Directly reading from config instead of using methods to create actual config objects
  const updateMandatoryAccounts = config['mandatory-account-configs'];
  const updateWorkLoadAccounts = config['workload-account-configs'];
  const mandatoryAccountConfigs = Object.entries(config['mandatory-account-configs']);
  const workLoadAccountsConfig = Object.entries(config['workload-account-configs']).filter(
    ([_, value]) => !value.deleted,
  );
  const updatedAccounts: UpdateAccountsOutput = {};
  for (const previousAccount of previousAccounts) {
    const currentAccount = awsAccounts.find(acc => acc.Id === previousAccount.id);
    if (!currentAccount) {
      console.log(`Account "${previousAccount.id}" is removed from Organizations`);
      continue;
    }
    if (!isAccountChanged(previousAccount, currentAccount)) {
      continue;
    }
    let isMandatoryAccount = true;
    let accountConfig = mandatoryAccountConfigs.find(([_, value]) =>
      equalIgnoreCase(value.email, previousAccount.email),
    );
    if (!accountConfig) {
      accountConfig = workLoadAccountsConfig.find(([_, value]) => equalIgnoreCase(value.email, previousAccount.email));
      isMandatoryAccount = false;
    }
    if (!accountConfig) {
      console.log(`Account "${previousAccount.email} not found in config, Ignoring"`);
      continue;
    }
    if (isMandatoryAccount) {
      // Update Account in Mandatory Accounts
      updateMandatoryAccounts[accountConfig[0]]['account-name'] = currentAccount.Name!;
      updateMandatoryAccounts[accountConfig[0]].email = currentAccount.Email!;
      // Storing account changes for updating actual configuration
      updatedAccounts[accountConfig[0]] = {
        email: currentAccount.Email,
        name: currentAccount.Name,
        filename: accountConfig[1]['src-filename'],
        type: 'mandatory',
      };
    } else {
      // Update Account in Workload Accounts
      updateWorkLoadAccounts[accountConfig[0]]['account-name'] = currentAccount.Name!;
      updateWorkLoadAccounts[accountConfig[0]].email = currentAccount.Email!;
      // Storing account changes for updating actual configuration
      updatedAccounts[accountConfig[0]] = {
        email: currentAccount.Email,
        name: currentAccount.Name,
        filename: accountConfig[1]['src-filename'],
        type: 'workload',
      };
    }
  }

  config['mandatory-account-configs'] = updateMandatoryAccounts;
  config['workload-account-configs'] = updateWorkLoadAccounts;
  return {
    config,
    updatedAccounts,
  };
};

const updateSuspendedAccounts = (props: {
  config: AcceleratorUpdateConfig;
  awsAccounts: org.Account[];
  updatedAccounts: UpdateAccountsOutput;
}): {
  config: AcceleratorConfig;
  updatedAccounts: UpdateAccountsOutput;
} => {
  const { awsAccounts, config, updatedAccounts } = props;
  // Directly reading from config instead of using methods to create actual config objects
  const updateMandatoryAccounts = config['mandatory-account-configs'];
  const updateWorkLoadAccounts = config['workload-account-configs'];
  const mandatoryAccountConfigs = Object.entries(config['mandatory-account-configs']);
  const workLoadAccountsConfig = Object.entries(config['workload-account-configs']);
  for (const awsAccount of awsAccounts.filter(acc => acc.Status === 'SUSPENDED')) {
    let isMandatoryAccount = true;
    let accountConfig = mandatoryAccountConfigs.find(([_, value]) => equalIgnoreCase(value.email, awsAccount.Email!));
    if (!accountConfig) {
      accountConfig = workLoadAccountsConfig.find(([_, value]) => equalIgnoreCase(value.email, awsAccount.Email!));
      isMandatoryAccount = false;
    }
    if (!accountConfig) {
      console.log(`Account "${awsAccount.Email!} not found in config, Ignoring"`);
      continue;
    }
    if (isMandatoryAccount) {
      // Update Account in Mandatory Accounts
      updateMandatoryAccounts[accountConfig[0]]['account-name'] = awsAccount.Name!;
      updateMandatoryAccounts[accountConfig[0]].email = awsAccount.Email!;
      updateMandatoryAccounts[accountConfig[0]].deleted = true;
      // Storing account changes for updating actual configuration
      updatedAccounts[accountConfig[0]] = {
        email: awsAccount.Email,
        name: awsAccount.Name,
        filename: accountConfig[1]['src-filename'],
        type: 'mandatory',
        deleted: true,
      };
    } else {
      // Update Account in Workload Accounts
      updateWorkLoadAccounts[accountConfig[0]]['account-name'] = awsAccount.Name!;
      updateWorkLoadAccounts[accountConfig[0]].email = awsAccount.Email!;
      updateWorkLoadAccounts[accountConfig[0]].deleted = true;
      // Storing account changes for updating actual configuration
      updatedAccounts[accountConfig[0]] = {
        email: awsAccount.Email,
        name: awsAccount.Name,
        filename: accountConfig[1]['src-filename'],
        type: 'workload',
        deleted: true,
      };
    }
  }

  config['mandatory-account-configs'] = updateMandatoryAccounts;
  config['workload-account-configs'] = updateWorkLoadAccounts;
  return {
    config,
    updatedAccounts,
  };
};

const isAccountChanged = (previousAccount: Account, currentAccount: org.Account): boolean => {
  let isChanged = false;
  if (previousAccount.name !== currentAccount.Name || !equalIgnoreCase(previousAccount.email, currentAccount.Email!)) {
    // Account did change
    isChanged = true;
  }
  return isChanged;
};

async function updateRenamedOrganizationalUnits(props: {
  config: AcceleratorUpdateConfig;
  previousOrganizationalUnits: ConfigOrganizationalUnit[];
  awsOus: OrganizationalUnit[];
  rootConfigString: string;
  updatedAccounts: UpdateAccountsOutput;
  format: FormatType;
}): Promise<{
  config: AcceleratorUpdateConfig;
  rootConfig: string;
  updatedAccounts: UpdateAccountsOutput;
}> {
  const { awsOus, config, previousOrganizationalUnits, rootConfigString, updatedAccounts, format } = props;
  const updateMandatoryAccounts = config['mandatory-account-configs'];
  const updateWorkLoadAccounts = config['workload-account-configs'];
  const updateOrganizationalUnits = config['organizational-units'];
  const organizationalUnitsConfig = Object.entries(config['organizational-units']);
  const mandatoryAccountConfigs = Object.entries(config['mandatory-account-configs']);
  const workLoadAccountsConfig = Object.entries(config['workload-account-configs']).filter(
    ([_, value]) => !value.deleted,
  );
  const rootConfig = getFormattedObject(rootConfigString, format);
  for (const previousOu of previousOrganizationalUnits) {
    const currentOu = awsOus.find(ou => ou.Id === previousOu.ouId);
    if (!currentOu) {
      console.log(`OrganizationalUnit "${previousOu.ouName}" is not found`);
      continue;
    }
    if (currentOu.Path === previousOu.ouPath) {
      console.log(`OrganizationalUnit "${previousOu.ouName}" is not changed`);
      continue;
    }
    // Search in Organizational-Units in config for ou (Name)
    const ouConfig = organizationalUnitsConfig.find(([key, _]) => key === previousOu.ouPath);
    if (ouConfig) {
      // OU Config found in Organizational-Units in config, Delete old key and replace config with new key
      const updatedOuConfig = updateOrganizationalUnits[previousOu.ouPath];
      delete updateOrganizationalUnits[previousOu.ouPath];
      updateOrganizationalUnits[currentOu.Path] = updatedOuConfig;

      // Changes for splited Config
      const previousOuRootConfig = rootConfig['organizational-units'][previousOu.ouPath];
      rootConfig['organizational-units'][currentOu.Path] = previousOuRootConfig;
      delete rootConfig['organizational-units'][previousOu.ouPath];
    }
    // Check for ou occurence in Mandatory accounts
    const mandatoryAccountsConfigPerOu = mandatoryAccountConfigs.filter(
      ([_, value]) => value.ou === previousOu.ouName && (!value['ou-path'] || value['ou-path'] === previousOu.ouPath),
    );

    // Updating in RAW Config for ou-validation usage
    for (const [accountKey, mandatoryAccount] of mandatoryAccountsConfigPerOu) {
      const updateMandatoryAccountConfig = mandatoryAccount;
      updateMandatoryAccountConfig.ou = currentOu.Name!;
      updateMandatoryAccountConfig['ou-path'] = currentOu.Path;
      updateMandatoryAccounts[accountKey] = updateMandatoryAccountConfig;
      if (updatedAccounts[accountKey]) {
        updatedAccounts[accountKey].ou = currentOu.Name;
        updatedAccounts[accountKey]['ou-path'] = currentOu.Path;
      } else {
        updatedAccounts[accountKey] = {
          type: 'mandatory',
          'ou-path': currentOu.Path,
          ou: currentOu.Name,
          filename: mandatoryAccount['src-filename'],
        };
      }
    }

    // Check for ou occurence in Mandatory accounts
    const workLoadAccountsConfigPerOu = workLoadAccountsConfig.filter(
      ([_, value]) => value.ou === previousOu.ouName && (!value['ou-path'] || value['ou-path'] === previousOu.ouPath),
    );
    for (const [accountKey, workLoadAccount] of workLoadAccountsConfigPerOu) {
      const updateWorkLoadAccountConfig = workLoadAccount;
      updateWorkLoadAccountConfig.ou = currentOu.Name!;
      updateWorkLoadAccountConfig['ou-path'] = currentOu.Path;
      updateWorkLoadAccounts[accountKey] = updateWorkLoadAccountConfig;
      if (updatedAccounts[accountKey]) {
        updatedAccounts[accountKey].ou = currentOu.Name;
        updatedAccounts[accountKey]['ou-path'] = currentOu.Path;
      } else {
        updatedAccounts[accountKey] = {
          type: 'workload',
          'ou-path': currentOu.Path,
          ou: currentOu.Name,
          filename: workLoadAccount['src-filename'],
        };
      }
    }
  }

  config['mandatory-account-configs'] = updateMandatoryAccounts;
  config['workload-account-configs'] = updateWorkLoadAccounts;
  config['organizational-units'] = updateOrganizationalUnits;
  return {
    config,
    updatedAccounts,
    rootConfig: getStringFromObject(rootConfig, format),
  };
}

async function createSuspendedOu(suspendedOuName: string, rootId: string): Promise<OrganizationalUnit> {
  const suspendedOu = await organizations.createOrganizationalUnit(suspendedOuName, rootId);
  return {
    ...suspendedOu,
    Path: suspendedOuName,
  };
}

async function createOrganizstionalUnits(
  config: AcceleratorUpdateConfig,
  awsOusWithPath: OrganizationalUnit[],
  rootId: string,
): Promise<OrganizationalUnit[]> {
  const result: OrganizationalUnit[] = [];
  const acceleratorOuConfigs = config['organizational-units'];
  const acceleratorOus = Object.keys(acceleratorOuConfigs);
  for (const acceleratorOu of acceleratorOus) {
    const awsOu = awsOusWithPath.find(ou => ou.Name === acceleratorOu);
    if (!awsOu) {
      // Create Missing OrganizationalUnit
      const orgUnit = await organizations.createOrganizationalUnit(acceleratorOu, rootId);
      awsOusWithPath.push({
        ...orgUnit,
        Path: acceleratorOu,
      });
      result.push({
        ...orgUnit,
        Path: acceleratorOu,
      });
    }
  }

  const acceleratorWorkLoadAccountConfigs = Object.entries(config['workload-account-configs']).filter(
    ([_, value]) => !value.deleted,
  );
  for (const [_, workLoadOu] of acceleratorWorkLoadAccountConfigs) {
    const ouPath = workLoadOu['ou-path']!;
    if (!ouPath) {
      const existingOu = awsOusWithPath.find(o => o.Path === workLoadOu.ou);
      if (!existingOu) {
        // console.log(`Creating new Organizational Unit "${workLoadOu.ou}" under Root`);
        const orgUnit = await organizations.createOrganizationalUnit(workLoadOu.ou, rootId);
        awsOusWithPath.push({
          ...orgUnit,
          Path: workLoadOu.ou,
        });
        result.push({
          ...orgUnit,
          Path: workLoadOu.ou,
        });
        continue;
      }
    } else {
      const ous = ouPath.split('/');
      let localParent = rootId;
      for (let i = 0; i < ous.length; i++) {
        const currentOuPath = ous.slice(0, i + 1).join('/');
        const existingOu = awsOusWithPath.find(o => o.Path === currentOuPath);
        let orgUnit: org.OrganizationalUnit | undefined;
        if (!existingOu) {
          // console.log(`Creating OrganizationalUnit "${ous[i]}" under Parent ${currentOuPath} and id ${localParent}`);
          orgUnit = await organizations.createOrganizationalUnit(ous[i], localParent);
          awsOusWithPath.push({
            ...orgUnit,
            Path: currentOuPath,
          });
          result.push({
            ...orgUnit,
            Path: currentOuPath,
          });
        } else {
          orgUnit = existingOu;
        }
        localParent = orgUnit?.Id!;
      }
    }
  }
  return result;
}

async function getConfigFromCodeCommit(repositoryName: string, commitId: string, filePath: string): Promise<string> {
  const config = await codecommit.getFile(repositoryName, filePath, commitId);
  return config.fileContent.toString();
}
