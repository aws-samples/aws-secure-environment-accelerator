import { Organizations, OrganizationalUnit } from '@aws-accelerator/common/src/aws/organizations';
import { StepFunctions } from '@aws-accelerator/common/src/aws/stepfunctions';
import * as org from 'aws-sdk/clients/organizations';
import { ScheduledEvent } from 'aws-lambda';
import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { delay } from '@aws-accelerator/common/src/util/delay';
import { pascalCase } from 'pascal-case';
import * as crypto from 'crypto';
import { pretty } from '@aws-accelerator/common/src/util/prettier';
import {
  getFormattedObject,
  getStringFromObject,
  RawConfig,
  equalIgnoreCase,
} from '@aws-accelerator/common/src/util/common';
import { AcceleratorUpdateConfig } from '@aws-accelerator/common-config';
import { JSON_FORMAT, YAML_FORMAT } from '@aws-accelerator/common/src/util/constants';
import { PutFileEntry } from 'aws-sdk/clients/codecommit';
import { getInvoker } from './utils';

interface MoveAccountOrganization extends ScheduledEvent {
  version?: string;
}

interface AccountInfo {
  name?: string;
  email?: string;
  filename: string;
  ou?: string;
  'ou-path'?: string;
  type: 'mandatory' | 'workload';
}

const defaultRegion = process.env.ACCELERATOR_DEFAULT_REGION!;
const acceleratorStateMachinearn = process.env.ACCELERATOR_STATE_MACHINE_ARN!;
const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME!;
const configFilePath = process.env.CONFIG_FILE_PATH!;
const configRootFilePath = process.env.CONFIG_ROOT_FILE_PATH!;
const configBranch = process.env.CONFIG_BRANCH_NAME!;
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME!;

const organizations = new Organizations();
const codecommit = new CodeCommit(undefined, defaultRegion);
const stepfunctions = new StepFunctions(undefined, defaultRegion);

export const handler = async (input: MoveAccountOrganization) => {
  console.log(`Account moved to Organization, adding account config to configuration...`);
  console.log(JSON.stringify(input, null, 2));
  const requestDetail = input.detail;
  const invokedBy = getInvoker(input);
  if (invokedBy && invokedBy === acceleratorRoleName) {
    console.log(`Move Account Performed by Accelerator, No operation required`);
    return {
      status: 'NO_OPERATION_REQUIRED',
    };
  }
  console.log(`Reading organization and account information from request`);
  const { accountId, destinationParentId, sourceParentId } = requestDetail.requestParameters;
  const account = await organizations.getAccount(accountId);
  if (!account) {
    console.error(`Account did not find in Organizations "${accountId}"`);
    return;
  }
  const rootOrg = await organizations.listRoots();
  const rootOrgId = rootOrg[0].Id;
  let updatestatus: string;

  const configResponse = await codecommit.getFile(configRepositoryName, configFilePath, configBranch);
  const config = getFormattedObject(configResponse.fileContent.toString(), JSON_FORMAT);
  const ignoredOus: string[] = config['global-options']['ignored-ous'] || [];
  if (sourceParentId === rootOrgId) {
    // Account is moving from Root Organization to another
    const destinationOrg = await organizations.getOrganizationalUnitWithPath(destinationParentId);
    const destinationRootOrg = destinationOrg.Name!;
    if (ignoredOus.includes(destinationRootOrg)) {
      console.log(`Movement is to IgnoredOu from ROOT, So no need to add it into configuration`);
      return 'IGNORE';
    }
    updatestatus = await updateConfig({
      account,
      destinationOrg,
    });
  } else if (destinationParentId === rootOrgId) {
    const parentOrg = await organizations.getOrganizationalUnitWithPath(sourceParentId);
    if (ignoredOus.includes(parentOrg.Name!)) {
      console.log(`Movement is to ROOT from ignoredOu, So no need to add it into configuration`);
      return 'IGNORE';
    }
    // Move account back to source and don't update config
    console.log(`Invalid moveAccount from ${sourceParentId} to ROOT Organization`);
    await organizations.moveAccount({
      AccountId: account.Id!,
      DestinationParentId: sourceParentId,
      SourceParentId: destinationParentId,
    });
    return 'FAILED';
  } else {
    const parentOrg = await organizations.getOrganizationalUnitWithPath(sourceParentId);
    const destinationOrg = await organizations.getOrganizationalUnitWithPath(destinationParentId);
    const parentRootOrg = parentOrg.Path.split('/')[0];
    const destinationRootOrg = destinationOrg.Path.split('/')[0];
    if (parentRootOrg !== destinationRootOrg && !ignoredOus.includes(parentRootOrg)) {
      // Move account back to source and don't change config
      console.log(`Invalid moveAccount from ${parentOrg.Path} to ${destinationOrg.Path}`);
      await organizations.moveAccount({
        AccountId: account.Id!,
        DestinationParentId: sourceParentId,
        SourceParentId: destinationParentId,
      });
      return 'FAILED';
    } else {
      // Update Config
      updatestatus = await updateConfig({
        account,
        destinationOrg,
      });
    }
  }
  if (updatestatus === 'SUCCESS') {
    await delay(1000);
    await startStateMachine(acceleratorStateMachinearn);
  }
  return 'SUCCESS';
};

async function updateConfig(props: { account: org.Account; destinationOrg: OrganizationalUnit }) {
  const { account, destinationOrg } = props;
  let newAccount = true;
  const extension = configRootFilePath?.split('.').slice(-1)[0];
  const format = extension === JSON_FORMAT ? JSON_FORMAT : YAML_FORMAT;
  // RAW Config
  const rootConfigResponse = await codecommit.getFile(configRepositoryName, configRootFilePath, configBranch);
  const rootConfig = getFormattedObject(rootConfigResponse.fileContent.toString(), format);
  const rawConfigResponse = await codecommit.getFile(configRepositoryName, configFilePath, configBranch);
  let latestCommitId = rawConfigResponse.commitId;
  const rawConfig: AcceleratorUpdateConfig = getFormattedObject(rawConfigResponse.fileContent.toString(), format);
  let accountInfo = Object.entries(rawConfig['mandatory-account-configs']).find(([_, ac]) =>
    equalIgnoreCase(ac.email, account.Email!),
  );
  const accountConfig: { [key: string]: AccountInfo } = {};
  const accountPrefix = rawConfig['global-options']['workloadaccounts-prefix'];
  let accountSuffix = rawConfig['global-options']['workloadaccounts-suffix']!;
  const wlaSuffixFileName = rawConfig['global-options']['workloadaccounts-param-filename'];
  let useNewConfigFile = false;
  let accountKey = '';
  if (accountInfo) {
    // Account found in Mandatory Account Config
    newAccount = false;
    accountKey = accountInfo[0];
    accountConfig[accountInfo[0]] = {
      filename: accountInfo[1]['src-filename'],
      type: 'mandatory',
      'ou-path': destinationOrg.Path,
      ou: destinationOrg.Name,
      email: account.Email,
      name: account.Name,
    };
  } else {
    // Check Account in Work Load Account Config
    accountInfo = Object.entries(rawConfig['workload-account-configs']).find(([_, ac]) =>
      equalIgnoreCase(ac.email, account.Email!),
    );
    if (accountInfo) {
      newAccount = false;
      accountKey = accountInfo[0];
      accountConfig[accountInfo[0]] = {
        filename: accountInfo[1]['src-filename'],
        type: 'workload',
        'ou-path': destinationOrg.Path,
        ou: destinationOrg.Name,
        email: account.Email,
        name: account.Name,
      };
    } else {
      // New Account
      accountKey = `${pascalCase(account.Name!).replace('_', '')}-${hashName(account.Email?.toLowerCase()!, 6)}`;
      if (`${accountPrefix}.${format}` === configRootFilePath) {
        console.log(`Account Found in Root Path`);
        accountConfig[accountKey] = {
          filename: configRootFilePath,
          type: 'workload',
          'ou-path': destinationOrg.Path,
          ou: destinationOrg.Name,
          email: account.Email,
          name: account.Name,
        };
      } else {
        try {
          const tempConfigResponse = await codecommit.getFile(
            configRepositoryName,
            `${accountPrefix}${accountSuffix}.${format}`,
            configBranch,
          );
          const workLoadAccount = pretty(tempConfigResponse.fileContent.toString(), format);
          if (workLoadAccount.split('\n').length + 7 > 2000) {
            useNewConfigFile = true;
          }
        } catch (error) {
          if (error.code === 'FileDoesNotExistException') {
            useNewConfigFile = false;
          }
        }
        if (useNewConfigFile) {
          accountSuffix += 1;
        }
        accountConfig[accountKey] = {
          filename: `${accountPrefix}${accountSuffix}.${format}`,
          type: 'workload',
          'ou-path': destinationOrg.Path,
          ou: destinationOrg.Name,
          email: account.Email,
          name: account.Name,
        };
      }
    }
  }

  const accConfig = Object.entries(accountConfig)[0];
  const accKey = accConfig[0];
  const accConfigObject = accConfig[1];
  if (!useNewConfigFile) {
    // Config will be stored in existing file either single file or splitted file
    try {
      if (accConfigObject.filename === configRootFilePath) {
        // If Accounts in Single Configuration File handling seperatly since we need to go to specific key
        const accountsInConfig = getFormattedObject(rawConfigResponse.fileContent.toString(), format);
        if (newAccount) {
          // New Account will go under WorkLoad Account
          accountsInConfig['workload-account-configs'][accKey] = {
            'account-name': accConfigObject.name!,
            email: accConfigObject.email!,
            ou: accConfigObject.ou!,
            'ou-path': accConfigObject['ou-path'],
            'src-filename': configRootFilePath,
          };
        } else {
          if (accConfigObject.type === 'mandatory') {
            accountsInConfig['mandatory-account-configs'][accKey].ou = destinationOrg.Name;
            accountsInConfig['mandatory-account-configs'][accKey].email = account.Email;
            accountsInConfig['mandatory-account-configs'][accKey]['account-name'] = account.Name;
            accountsInConfig['mandatory-account-configs'][accKey]['ou-path'] = destinationOrg.Path;
            if (accountsInConfig['mandatory-account-configs'][accKey].deleted) {
              accountsInConfig['mandatory-account-configs'][accKey].deleted = false;
            }
          } else {
            accountsInConfig['workload-account-configs'][accKey].ou = destinationOrg.Name;
            accountsInConfig['workload-account-configs'][accKey].email = account.Email;
            accountsInConfig['workload-account-configs'][accKey]['account-name'] = account.Name;
            accountsInConfig['workload-account-configs'][accKey]['ou-path'] = destinationOrg.Path;
            if (accountsInConfig['workload-account-configs'][accKey].deleted) {
              accountsInConfig['workload-account-configs'][accKey].deleted = false;
            }
          }
        }
        latestCommitId = await codecommit.commit({
          branchName: configBranch,
          repositoryName: configRepositoryName,
          putFiles: [
            {
              filePath: configRootFilePath,
              fileContent: pretty(getStringFromObject(accountsInConfig, format), format),
            },
          ],
          parentCommitId: rawConfigResponse.commitId,
        });
      } else {
        // Account Config will go to existing seperate Config File, either new account ot existing account
        let accountFileString;
        let accountFile;
        try {
          const accountFileResponse = await codecommit.getFile(
            configRepositoryName,
            accConfigObject.filename,
            configBranch,
          );
          accountFileString = accountFileResponse.fileContent.toString();
          accountFile = getFormattedObject(accountFileString, format);
        } catch (error) {
          if (error.code === 'FileDoesNotExistException') {
            accountFile = {};
          } else {
            throw new Error(error);
          }
        }
        if (newAccount) {
          accountFile[accKey] = {
            'account-name': accConfigObject.name!,
            email: accConfigObject.email!,
            ou: accConfigObject.ou!,
            'ou-path': accConfigObject['ou-path'],
            'src-filename': configRootFilePath,
          };
        } else {
          accountFile[accKey].ou = accConfigObject.ou;
          accountFile[accKey]['ou-path'] = accConfigObject['ou-path'];
          accountFile[accKey]['account-name'] = accConfigObject.name;
          accountFile[accKey].email = accConfigObject.email;
          if (accountFile[accKey].deleted) {
            accountFile[accKey].deleted = false;
          }
        }
        latestCommitId = await codecommit.commit({
          branchName: configBranch,
          repositoryName: configRepositoryName,
          putFiles: [
            {
              filePath: accConfigObject.filename,
              fileContent: pretty(getStringFromObject(accountFile, format), format),
            },
          ],
          parentCommitId: rawConfigResponse.commitId,
        });
      }
    } catch (error) {
      if (error.code === 'NoChangeException') {
        console.log(`No Change in Configuration form Previous Execution`);
      } else {
        throw new Error(error);
      }
    }
  } else {
    // Config will go to new account based on prefix and suffix in global options and also update global options
    const updateFiles: PutFileEntry[] = [];
    const wlaConfig: { [key: string]: unknown } = {};
    wlaConfig[accountKey] = {
      'account-name': accountConfig[accountKey].name,
      email: accountConfig[accountKey].email,
      ou: accountConfig[accountKey].ou,
      'ou-path': accountConfig[accountKey]['ou-path'],
      'src-filename': accountConfig[accountKey].filename,
    };
    updateFiles.push({
      filePath: accountConfig[accountKey].filename,
      fileContent: pretty(getStringFromObject(wlaConfig, format), format),
    });
    if (!rootConfig['workload-account-configs'].__LOAD.includes(accountConfig[accountKey].filename)) {
      rootConfig['workload-account-configs'].__LOAD.push(accountConfig[accountKey].filename);
    }
    if (configRootFilePath === wlaSuffixFileName) {
      rootConfig['global-options']['workloadaccounts-suffix'] = accountSuffix;
    } else {
      const globalOptionsResponse = await codecommit.getFile(configRepositoryName, wlaSuffixFileName, configBranch);
      const globalOptions = getFormattedObject(globalOptionsResponse.fileContent.toString(), format);
      globalOptions['workloadaccounts-suffix'] = accountSuffix;
      updateFiles.push({
        filePath: wlaSuffixFileName,
        fileContent: pretty(getStringFromObject(globalOptions, format), format),
      });
    }
    updateFiles.push({
      filePath: configRootFilePath,
      fileContent: pretty(getStringFromObject(rootConfig, format), format),
    });

    try {
      console.log(`Adding account to configuration through Move-Account: ${accountConfig[accountKey].filename}`);
      latestCommitId = await codecommit.commit({
        branchName: configBranch,
        repositoryName: configRepositoryName,
        putFiles: updateFiles,
        commitMessage: `Adding account to configuration through Move-Account`,
        parentCommitId: rawConfigResponse.commitId,
      });
    } catch (error) {
      if (error.code === 'NoChangeException') {
        console.log(`No Change in Configuration form Previous Execution`);
      } else {
        throw new Error(error);
      }
    }
  }

  // Updating Raw Config
  const rawConfigObject = new RawConfig({
    branchName: configBranch,
    configFilePath: configRootFilePath,
    format,
    repositoryName: configRepositoryName,
    source: 'codecommit',
    region: defaultRegion,
  });
  const config = await rawConfigObject.prepare();

  try {
    await codecommit.commit({
      branchName: configBranch,
      repositoryName: configRepositoryName,
      putFiles: config.loadFiles,
      commitMessage: `Updating Raw Config in SM after Move Account`,
      parentCommitId: latestCommitId,
    });
  } catch (error) {
    if (error.code === 'NoChangeException') {
      console.log(`No Change in Configuration form Previous Execution`);
    } else {
      throw new Error(error);
    }
  }
  return 'SUCCESS';
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function startStateMachine(stateMachineArn: string): Promise<string> {
  // Setting 2 mins sleep before SM execution on Successfull account move.
  await sleep(2 * 60 * 1000);

  const runningExecutions = await stepfunctions.listExecutions({
    stateMachineArn,
    statusFilter: 'RUNNING',
  });

  if (runningExecutions.length === 0) {
    await stepfunctions.startExecution({
      stateMachineArn,
    });
  } else {
    return 'SM_ALREADY_RUNNING';
  }
  return 'SUCCESS';
}

function hashName(name: string, length: number) {
  const hash = crypto.createHash('md5').update(name).digest('hex');
  return hash.slice(0, length).toUpperCase();
}
