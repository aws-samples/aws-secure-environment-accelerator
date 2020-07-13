import * as org from 'aws-sdk/clients/organizations';
import { Organizations, OrganizationalUnit } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { AcceleratorConfig, AcceleratorUpdateConfig } from '@aws-pbmm/common-lambda/lib/config';
import { ServiceControlPolicy, FULL_AWS_ACCESS_POLICY_NAME } from '@aws-pbmm/common-lambda/lib/scp';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { OrganizationalUnit as ConfigOrganizationalUnit } from '@aws-pbmm/common-outputs/lib/organizations';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { prepareRawConfig } from './get-or-create-config';

export interface ValdationInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  acceleratorPrefix: string;
  accountsSecretId: string;
  organizationsSecretId: string;
  configBranch: string;
}

const organizations = new Organizations();
const secrets = new SecretsManager();
const codecommit = new CodeCommit();

/**
 *
 * @param input ValdationInput
 * - Check for renamed accounts and update in codecommit config file
 * - Check for renamed Organizations and update in codecommit config file
 * - Check for non created OUs in config file and create OUs
 * - Create Suspended OU and move all suspended accounts to it
 * - Attach QNO Scp to all free accounts under root and Suspended OU
 */
export const handler = async (input: ValdationInput): Promise<string> => {
  console.log(`Loading Organization baseline configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    configFilePath,
    configRepositoryName,
    configCommitId,
    acceleratorPrefix,
    accountsSecretId,
    organizationsSecretId,
    configBranch,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  // Reading directly from CodeCommit because of cidr objects
  // TODO: Might need a common method when we start using multiple configuration files
  const configCommit = await codecommit.getFile(configRepositoryName, configFilePath, configCommitId);
  const previousConfigString = configCommit.fileContent.toString();
  const previousConfig = JSON.parse(previousConfigString);

  const rootConfigString = await getConfigFromCodeCommit(configRepositoryName, configCommitId, 'config.json');
  let config = previousConfig;
  const previousAccounts = await loadAccounts(accountsSecretId);
  const previousOrganizationalUnits = await loadOrganizations(organizationsSecretId);
  const organizationAdminRole = config['global-options']['organization-admin-role'];
  const scps = new ServiceControlPolicy(acceleratorPrefix, organizationAdminRole, organizations);

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

  console.log(`Found organizational units:`);
  console.log(JSON.stringify(awsOusWithPath, null, 2));

  // change config based on rename Accounts
  config = updateRenamedAccounts(config, previousAccounts, awsAccounts);
  // change config based on rename Organizational Units
  config = await updateRenamedOrganizationalUnits(
    config, 
    previousOrganizationalUnits, 
    awsOusWithPath, 
    rootConfigString,
    configRepositoryName,
    configBranch,
  );

  const roots = await organizations.listRoots();
  const rootId = roots[0].Id!;
  awsOusWithPath.push(...(await createOrganizstionalUnits(config, awsOusWithPath, rootId)));

  const suspendedOuName = 'Suspended';
  let suspendedOu = awsOusWithPath.find(o => o.Path === suspendedOuName);
  if (!suspendedOu) {
    suspendedOu = await createSuspendedOu(suspendedOuName, rootId);
    awsOusWithPath.push(suspendedOu);
  }

  // List Suspended Accounts
  // TODO Testing
  for (const [ouId, accounts] of Object.entries(awsOuAccountMap)) {
    const suspendedAccounts = accounts.filter(account => account.Status === 'SUSPENDED');
    for (const suspendedAccount of suspendedAccounts) {
      await organizations.moveAccount({
        AccountId: suspendedAccount.Id!,
        DestinationParentId: suspendedOu.Id!,
        SourceParentId: ouId,
      });
    }
  }
  // Attach Qurantine SCP to root Accounts
  const policyId = await scps.createOrUpdateQuarantineScp();
  const rootAccounts = await organizations.listAccountsForParent(rootId);
  const rootAccountIds = rootAccounts.map(acc => acc.Id);
  // Detach target from all polocies except FullAccess and Qurantine SCP
  for (const targetId of [...rootAccountIds, suspendedOu.Id]) {
    await scps.detachPoliciesFromTargets({
      policyNamesToKeep: [
        ServiceControlPolicy.createQuarantineScpName({ acceleratorPrefix }),
        FULL_AWS_ACCESS_POLICY_NAME,
      ],
      policyTargetIdsToInclude: [targetId!],
    });
  }
  const policyTargets = await organizations.listTargetsForPolicy({
    PolicyId: policyId,
  });
  const existingTargets = policyTargets.map(target => target.TargetId);
  const targetIds = rootAccountIds.filter(targetId => !existingTargets.includes(targetId));
  if (!existingTargets.includes(suspendedOu.Id)) {
    targetIds.push(suspendedOu.Id);
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
      });
      if (!updatedTargetIdsForQnoScp.includes(rootOrg.Id)) {
        await organizations.attachPolicy(policyId, rootOrg.Id!);
      }
    }
  }
  // Preparing Raw config to hadle any errors on previous execution
  const rawConfig = await prepareRawConfig({
    branchName: configBranch,
    configRootPath: configFilePath,
    configString: config,
    repositoryName: configRepositoryName,
    source: 'codecommit',
  });
  const commitStatus = await updateConfig(rawConfig, configBranch, configRepositoryName, configFilePath);
  return commitStatus || configCommitId;
};

async function createCommit(
  config: AcceleratorConfig,
  parentCommitId: string,
  configBranch: string,
  configRepositoryName: string,
  configFilePath: string,
): Promise<string | undefined> {
  try {
    const commitId = await codecommit.commit({
      branchName: configBranch,
      repositoryName: configRepositoryName,
      parentCommitId,
      putFiles: [
        {
          filePath: configFilePath,
          fileContent: JSON.stringify(config, null, 2),
        },
      ],
    });
    console.log(`Updated Configuration file in CodeCommit CommitId: ${commitId}`);
    return commitId;
  } catch (error) {
    if (error.code === 'NoChangeException') {
      return;
    } else {
      throw new Error(error);
    }
  }
}

async function loadAccounts(accountsSecretId: string): Promise<Account[]> {
  const secret = await secrets.getSecret(accountsSecretId);
  if (!secret) {
    throw new Error(`Cannot find secret with ID "${accountsSecretId}"`);
  }
  return JSON.parse(secret.SecretString!);
}

async function loadOrganizations(organizationsSecretId: string): Promise<ConfigOrganizationalUnit[]> {
  const secret = await secrets.getSecret(organizationsSecretId);
  if (!secret) {
    throw new Error(`Cannot find secret with ID "${organizationsSecretId}"`);
  }
  return JSON.parse(secret.SecretString!);
}

const updateRenamedAccounts = (
  config: AcceleratorUpdateConfig,
  previousAccounts: Account[],
  awsAccounts: org.Account[],
): AcceleratorConfig => {
  // Directly reading from config instead of using methods to create actual config objects
  const updateMandatoryAccounts = config['mandatory-account-configs'];
  const updateWorkLoadAccounts = config['workload-account-configs'];
  const mandatoryAccountConfigs = Object.entries(config['mandatory-account-configs']);
  const workLoadAccountsConfig = Object.entries(config['workload-account-configs']).filter(
    ([_, value]) => !value.deleted,
  );
  for (const previousAccount of previousAccounts) {
    const currentAccount = awsAccounts.find(acc => acc.Id === previousAccount.id);
    if (!currentAccount) {
      console.log(`Account "${previousAccount.id}" is removed from Orfanizations`);
      continue;
    }
    if (!isAccountChanged(previousAccount, currentAccount)) {
      continue;
    }
    let isMandatoryAccount = true;
    let accountConfig = mandatoryAccountConfigs.find(([_, value]) => value.email === previousAccount.email);
    if (!accountConfig) {
      accountConfig = workLoadAccountsConfig.find(([_, value]) => value.email === previousAccount.email);
      isMandatoryAccount = false;
    }
    if (!accountConfig) {
      console.log(`Account "${previousAccount.email} not found in config, Ignoring"`);
      continue;
    }
    if (isMandatoryAccount) {
      // Update Account in Mandatory Accounts
      const updatedAccountConfig = updateMandatoryAccounts[accountConfig[0]];
      updatedAccountConfig['account-name'] = currentAccount.Name!;
      updatedAccountConfig.email = currentAccount.Email!;
      updateMandatoryAccounts[accountConfig[0]] = updatedAccountConfig;
      // TODO update accountConfig in mandatory-account-config __LOAD
    } else {
      // Update Account in Workload Accounts
      const updatedAccountConfig = updateWorkLoadAccounts[accountConfig[0]];
      updatedAccountConfig['account-name'] = currentAccount.Name!;
      updatedAccountConfig.email = currentAccount.Email!;
      updateWorkLoadAccounts[accountConfig[0]] = updatedAccountConfig;
      // TODO update accountConfig in workload-account-config __LOAD
    }
  }
  config['mandatory-account-configs'] = updateMandatoryAccounts;
  config['workload-account-configs'] = updateWorkLoadAccounts;
  return config;
};

const isAccountChanged = (previousAccount: Account, currentAccount: org.Account): boolean => {
  let isChanged = false;
  if (previousAccount.name !== currentAccount.Name || previousAccount.email !== currentAccount.Email) {
    // Account did change
    isChanged = true;
  }
  return isChanged;
};

async function updateRenamedOrganizationalUnits(
  config: AcceleratorUpdateConfig,
  previousOrganizationalUnits: ConfigOrganizationalUnit[],
  awsOus: OrganizationalUnit[],
  rootConfigString: string,
  configRepositoryName: string,
  configBranch: string,
): Promise<AcceleratorConfig> {
  const updateMandatoryAccounts = config['mandatory-account-configs'];
  const updateWorkLoadAccounts = config['workload-account-configs'];
  const updateOrganizationalUnits = config['organizational-units'];
  const organizationalUnitsConfig = Object.entries(config['organizational-units']);
  const mandatoryAccountConfigs = Object.entries(config['mandatory-account-configs']);
  const workLoadAccountsConfig = Object.entries(config['workload-account-configs']).filter(
    ([_, value]) => !value.deleted,
  );
  const rootConfig = JSON.parse(rootConfigString);
  let changeInMandatoryAccount = false;
  let changeInWorkLoadAccount = false;
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

      // Splited config updation
      const previousOuRootConfig = rootConfig['organizational-units'][previousOu.ouPath];
      console.log(previousOuRootConfig, previousOu.ouPath, rootConfig);
      delete rootConfig['organizational-units'][previousOu.ouPath];
      const prevousOuConfigFile = previousOuRootConfig['__LOAD'];
      previousOuRootConfig['__LOAD'] = previousOuRootConfig['__LOAD'].replace(`${previousOu.ouPath}.json`, `${currentOu.Path}.json`);
      rootConfig['organizational-units'][currentOu.Path] = previousOuRootConfig;
      let parentCommitId = await updateConfig(JSON.stringify(rootConfig, null, 2), configBranch, configRepositoryName, 'config.json');
      if (!updateConfig) {
        const latestCommit = await codecommit.getBranch(configRepositoryName, configBranch);
        parentCommitId = latestCommit.branch?.commitId;
      }
      // Delete old OU File
      await codecommit.deleteFile({
        branchName: configBranch,
        filePath: prevousOuConfigFile,
        parentCommitId: parentCommitId!,
        repositoryName: configRepositoryName,
        commitMessage: `Removing Old Config file since ou got renamed ${previousOu.ouPath}`,
      });
      await updateConfig(JSON.stringify(updatedOuConfig, null, 2), configBranch,configRepositoryName,previousOuRootConfig['__LOAD'])
    }
    // Check for ou occurence in Mandatory accounts
    const mandatoryAccountsConfigPerOu = mandatoryAccountConfigs.filter(
      ([_, value]) => value.ou === previousOu.ouName && (!value['ou-path'] || value['ou-path'] === previousOu.ouPath),
    );
    for (const [accountKey, mandatoryAccount] of mandatoryAccountsConfigPerOu) {
      changeInMandatoryAccount = true;
      const updateMandatoryAccountConfig = mandatoryAccount;
      updateMandatoryAccountConfig.ou = currentOu.Path.split('/')[0];
      updateMandatoryAccountConfig['ou-path'] = currentOu.Path;
      updateMandatoryAccounts[accountKey] = updateMandatoryAccountConfig;
    }

    // Check for ou occurence in Mandatory accounts
    const workLoadAccountsConfigPerOu = workLoadAccountsConfig.filter(
      ([_, value]) => value.ou === previousOu.ouName && (!value['ou-path'] || value['ou-path'] === previousOu.ouPath),
    );
    for (const [accountKey, workLoadAccount] of workLoadAccountsConfigPerOu) {
      const updateWorkLoadAccountConfig = workLoadAccount;
      updateWorkLoadAccountConfig.ou = currentOu.Path.split('/')[0];
      updateWorkLoadAccountConfig['ou-path'] = currentOu.Path;
      updateWorkLoadAccounts[accountKey] = updateWorkLoadAccountConfig;
    }
  }
  config['mandatory-account-configs'] = updateMandatoryAccounts;
  config['workload-account-configs'] = updateWorkLoadAccounts;
  config['organizational-units'] = updateOrganizationalUnits;
  if (changeInMandatoryAccount) {
    await updateConfig(
      JSON.stringify(updateMandatoryAccounts, null, 2),
      configBranch,
      configRepositoryName,
      rootConfig['mandatory-account-configs']['__LOAD']
    );
  }
  return config;
};

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

async function updateConfig(
  config: string,
  configBranch: string,
  configRepositoryName: string,
  configFilePath: string,
): Promise<string | undefined> {
  try {
    const currentCommit = await codecommit.getBranch(configRepositoryName, configBranch);
    const parentCommitId = currentCommit.branch?.commitId;
    const commit = await codecommit.putFile({
      branchName: configBranch,
      repositoryName: configRepositoryName,
      parentCommitId,
      fileContent: config,
      filePath: configFilePath,
      commitMessage: `Updating Configuration as part of OU Validation because of Organization Rename`,
    });
    console.log(`Updated Configuration file in CodeCommit ${configFilePath} CommitId: ${commit.commitId}`);
    return commit.commitId;
  } catch (error) {
    console.error(error);
    if (error.code === 'NoChangeException' || error.code === 'SameFileContentException') {
      return;
    } else {
      throw new Error(error);
    }
  }
}


handler({
  "configRepositoryName": "PBMMAccel-Config-Repo",
  "acceleratorPrefix": "PBMMAccel-",
  "accountsSecretId": "arn:aws:secretsmanager:ca-central-1:131599432352:secret:accelerator/accounts-5ZA3VN",
  "organizationsSecretId": "arn:aws:secretsmanager:ca-central-1:131599432352:secret:accelerator/organizations-V3JLHk",
  "configBranch": "master",
  "configFilePath": "raw/config.json",
  "configCommitId": "a43eb241d5ada3fe2bde5226d580953755443e1a"
});