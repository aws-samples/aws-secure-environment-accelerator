import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { ScheduledEvent } from 'aws-lambda';
import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';


interface MoveAccountOrganization extends ScheduledEvent {
  version?: string;
}

const defaultRegion = process.env.ACCELERATOR_DEFAULT_REGION || 'ca-central-1';
const organizations = new Organizations();
const codecommit = new CodeCommit(undefined, defaultRegion);

export const handler = async (input: MoveAccountOrganization) => {
  console.log(`Account moved to Organization, adding account config to configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const acceleratorPrefix = process.env.ACCELERATOR_PREFIX || 'PBMMAccel-';
  const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME || 'PBMMAccel-Config-Repo';
  const configFilePath = process.env.CONFIG_FILE_PATH || 'config.json';
  const configBranch = process.env.CONFIG_REPOSITORY_BRANCH || 'master';
  const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME || 'PBMMAccel-L-SFN-MasterRole-DD650BE8';

  const configCommit = await codecommit.getFile(configRepositoryName, configFilePath, configBranch);
  const parentCommitId = configCommit.commitId;
  const config = configCommit.fileContent.toString();
  
  const requestDetail = input.detail;
  const invokedBy = requestDetail.userIdentity.sessionContext.sessionIssuer.userName;
  if (invokedBy === acceleratorRoleName) {
    console.log(`Move Account Performed by Accelerator, No operation required`);
    return {
      status: 'NO_OPERATION_REQUIRED',
    }
  }
  console.log(`Reading organization and account information from request`);
  const { accountId, destinationParentId, sourceParentId } = requestDetail.requestParameters;

  const account = await organizations.getAccount(accountId);
  if (!account) {
    console.error(`Account did not find in Organizations "${accountId}"`);
    return;
  }
  // const parentOrg = await organizations.getOrganizationalUnit(sourceParentId);
  const rootOrg = await organizations.listRoots();
  const rootOrgId = rootOrg[0].Id;
  const updateConfig = JSON.parse(config);
  let workLoadAccounts = updateConfig['workload-account-configs'];
  if (rootOrgId === destinationParentId) {
    console.log(`Account moved to Root, Removing account "${account.Name}"information from config file.`);
    delete workLoadAccounts[account.Name!];
    updateConfig['workload-account-configs'] = workLoadAccounts;
  } else {
    console.log('Account moved, Adding/Updating account information in config file.');
    const destinationOrg = await organizations.getOrganazationUnitWithPath(destinationParentId);
    let accountConfig = workLoadAccounts[account.Name!];
    if (accountConfig) {
      // TODO: Perform necessery tasks with respect move account from one or to another after SM execution
      accountConfig.ou = destinationOrg.Name!;
      accountConfig.oupath = destinationOrg.Path;
    } else {
      accountConfig = {
        'account-name': account.Name!,
        email: account.Email!,
        ou: destinationOrg.Name!,
        oupath: destinationOrg.Path,
      }
    }
    workLoadAccounts[account.Name!] = accountConfig;
    updateConfig['workload-account-configs'] = workLoadAccounts;
  }
  console.log('Updated Work-Load-Accounts: ', JSON.stringify(workLoadAccounts, null, 2));
  const commitId = await codecommit.commit({
    branchName: configBranch,
    repositoryName: configRepositoryName,
    parentCommitId,
    putFiles: [{
      filePath: configFilePath,
      fileContent: JSON.stringify(updateConfig, null, 2),
    }]
  });
  console.log(`Updated Configuration file in CodeCommit CommitId: ${commitId}`)
  return 'SUCCESS';
};