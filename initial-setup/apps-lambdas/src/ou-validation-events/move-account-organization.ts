import { Organizations, OrganizationalUnit } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { StepFunctions } from '@aws-pbmm/common-lambda/lib/aws/stepfunctions';
import * as org from 'aws-sdk/clients/organizations';
import { ScheduledEvent } from 'aws-lambda';
import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { delay } from '@aws-pbmm/common-lambda/lib/util/delay';
import { pascalCase } from 'pascal-case';
import * as crypto from 'crypto';
import { pretty } from '@aws-pbmm/common-lambda/lib/util/perttier';
import { getFormatedObject, getStringFromObject } from '@aws-pbmm/common-lambda/lib/util/utils';
import { AcceleratorConfig, AcceleratorUpdateConfig, AccountsConfig } from '@aws-pbmm/common-lambda/lib/config';

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
const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME! || 'PBMMAccel-Config-Repo-Testing';
const configFilePath = process.env.CONFIG_FILE_PATH! || 'raw/config.json';
const configRootFilePath = process.env.CONFIG_ROOT_FILE_PATH! || 'config.json';
const configBranch = process.env.CONFIG_BRANCH_NAME! || 'master';
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME! || 'PBMMAccel-MainStateMachine_sm';

const organizations = new Organizations();
const codecommit = new CodeCommit(undefined, defaultRegion);
const stepfunctions = new StepFunctions(undefined, defaultRegion);

export const handler = async (input: MoveAccountOrganization) => {
  console.log(`Account moved to Organization, adding account config to configuration...`);
  console.log(JSON.stringify(input, null, 2));
  const requestDetail = input.detail;
  const invokedBy = requestDetail.userIdentity.sessionContext.sessionIssuer.userName;
  if (invokedBy === acceleratorRoleName) {
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
  const config = getFormatedObject(configResponse.fileContent.toString(), 'json');
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
      destinationRootOrg,
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
        destinationRootOrg,
      });
    }
  }
  if (updatestatus === 'SUCCESS') {
    await delay(1000);
    await startStateMachine(acceleratorStateMachinearn);
  }
  return 'SUCCESS';
};

async function updateConfig(props: {
  account: org.Account;
  destinationOrg: OrganizationalUnit;
  destinationRootOrg: string;
}) {
  const { account, destinationOrg } = props;
  let newAccount = true;
  const extension = configRootFilePath?.split('.').slice(-1)[0];
  const format = extension === 'json' ? 'json' : 'yaml';
  // RAW Config
  const rawConfigResponse = await codecommit.getFile(configRepositoryName, configRootFilePath, configBranch);
  const rootConfigResponse = await codecommit.getFile(configRepositoryName, configFilePath, configBranch);
  const rawConfig: AcceleratorUpdateConfig = getFormatedObject(rawConfigResponse.fileContent.toString(), format);
  let accountInfo = Object.entries(rawConfig['mandatory-account-configs']).find(
    ([_, ac]) => ac.email === account.Email!,
  );
  const accountConfig: { [key: string]: AccountInfo } = {};
  const accountPrefix = rawConfig['global-options']['workloadaccounts-prefix'];
  let accountSuffix = rawConfig['global-options']['workloadaccounts-suffix']!;
  let useNewConfigFile = false;
  let accountKey = '';
  if (accountInfo) {
    // Check Account in Mandatory Account Config
    newAccount = false;
    accountKey = accountInfo[0];
    accountConfig[accountInfo[0]] = {
      filename: accountInfo[1]['file-name'],
      type: 'mandatory',
      'ou-path': destinationOrg.Path,
      ou: destinationOrg.Name,
      email: account.Email,
      name: account.Name,
    };
  } else {
    // Check Account in Work Load Account Config
    accountInfo = Object.entries(rawConfig['workload-account-configs']).find(([_, ac]) => ac.email === account.Email!);
    if (accountInfo) {
      newAccount = false;
      accountKey = accountInfo[0];
      accountConfig[accountInfo[0]] = {
        filename: accountInfo[1]['file-name'],
        type: 'workload',
        'ou-path': destinationOrg.Path,
        ou: destinationOrg.Name,
        email: account.Email,
        name: account.Name,
      };
    } else {
      // New Account
      accountKey = `${pascalCase(account.Name!)}-${hashName(account.Email!, 6)}`;
      if (`${accountPrefix}.${format}` === configRootFilePath) {
        console.log(`Account Found in Root Path`);
        accountKey = accountKey;
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
          if (workLoadAccount.split('/n').length + 7 > 10) {
            useNewConfigFile = true;
          }
        } catch (error) {
          if (error.code === 'FileDoesNotExistException') {
            useNewConfigFile = false;
          }
        }
        if (!useNewConfigFile) {
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
        const accountsInConfig = getFormatedObject(rootConfigResponse.fileContent.toString(), format);
        if (newAccount) {
          // New Account will go under WorkLoad Account
          accountsInConfig['workload-account-configs'][accKey] = {
            'account-name': accConfigObject.name!,
            email: accConfigObject.email!,
            ou: accConfigObject.ou!,
            'ou-path': accConfigObject['ou-path'],
            'file-name': configRootFilePath,
          };
        } else {
          if (accConfigObject.type === 'mandatory') {
            accountsInConfig['mandatory-account-configs'][accKey].ou = destinationOrg.Name;
            accountsInConfig['mandatory-account-configs'][accKey].email = account.Email;
            accountsInConfig['mandatory-account-configs'][accKey]['accoount-name'] = account.Name;
            accountsInConfig['mandatory-account-configs'][accKey]['ou-path'] = destinationOrg.Path;
          } else {
            accountsInConfig['workload-account-configs'][accKey].ou = destinationOrg.Name;
            accountsInConfig['workload-account-configs'][accKey].email = account.Email;
            accountsInConfig['workload-account-configs'][accKey]['accoount-name'] = account.Name;
            accountsInConfig['workload-account-configs'][accKey]['ou-path'] = destinationOrg.Path;
          }
        }
        console.log(`Update Account in main Config`);
        await codecommit.commit({
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
        const accountFileResponse = await codecommit.getFile(
          configRepositoryName,
          accConfigObject.filename,
          configBranch,
        );
        const accountFileString = accountFileResponse.fileContent.toString();
        const accountFile = getFormatedObject(accountFileString, format);
        if (newAccount) {
          accountFile[accKey] = {
            'account-name': accConfigObject.name!,
            email: accConfigObject.email!,
            ou: accConfigObject.ou!,
            'ou-path': accConfigObject['ou-path'],
            'file-name': configRootFilePath,
          };
        } else {
          accountFile[accKey].ou = accConfigObject.ou;
          accountFile[accKey]['ou-path'] = accConfigObject['ou-path'];
          accountFile[accKey]['account-name'] = accConfigObject.name;
          accountFile[accKey].email = accConfigObject.email;
        }
        await codecommit.commit({
          branchName: configBranch,
          repositoryName: configRepositoryName,
          putFiles: [
            {
              filePath: accConfigObject.filename,
              fileContent: pretty(getStringFromObject(accountFile, format), format),
            },
          ],
          parentCommitId: accountFileResponse.commitId,
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
    const globalOptionsResponse = await codecommit.getFile(
      configRepositoryName,
      rawConfig['global-options']['file-name'],
      configBranch,
    );
    const globalOptions = getFormatedObject(globalOptionsResponse.fileContent.toLocaleString(), format);
    globalOptions['workloadaccounts-suffix'] = accountSuffix;
    const wlaConfig: { [key: string]: unknown } = {};
    wlaConfig[accountKey] = {
      'account-name': accountConfig[accountKey].name,
      email: accountConfig[accountKey].email,
      ou: accountConfig[accountKey].ou,
      'ou-path': accountConfig[accountKey]['ou-path'],
      'file-name': accountConfig[accountKey].filename,
    };
    try {
      console.log(`Adding account to configuration through Move-Account: ${accountConfig[accountKey].filename}`);
      await codecommit.commit({
        branchName: configBranch,
        repositoryName: configRepositoryName,
        putFiles: [
          {
            filePath: accountConfig[accountKey].filename,
            fileContent: pretty(getStringFromObject(wlaConfig, format), format),
          },
          {
            filePath: rawConfig['global-options']['file-name'],
            fileContent: pretty(getStringFromObject(globalOptions, format), format),
          },
        ],
        commitMessage: `Adding account to configuration through Move-Account`,
        parentCommitId: globalOptionsResponse.commitId,
      });
    } catch (error) {
      if (error.code === 'NoChangeException') {
        console.log(`No Change in Configuration form Previous Execution`);
      } else {
        throw new Error(error);
      }
    }
  }
  return 'SUCCESS';
}

async function startStateMachine(stateMachineArn: string): Promise<string> {
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

// handler({
//   "version": "0",
//   "id": "579d06ba-c104-8760-5882-bd2a3275791d",
//   "detail-type": "AWS API Call via CloudTrail",
//   "source": "aws.organizations",
//   "account": "538235518685",
//   "time": "2020-07-28T11:35:28Z",
//   "region": "us-east-1",
//   "resources": [],
//   "detail": {
//       "eventVersion": "1.05",
//       "userIdentity": {
//           "type": "AssumedRole",
//           "principalId": "AROAX2UKWH3O4FA6K6N3J:nkoppula-Isengard",
//           "arn": "arn:aws:sts::538235518685:assumed-role/Admin/nkoppula-Isengard",
//           "accountId": "538235518685",
//           "accessKeyId": "ASIAX2UKWH3OXR2UVS5V",
//           "sessionContext": {
//               "sessionIssuer": {
//                   "type": "Role",
//                   "principalId": "AROAX2UKWH3O4FA6K6N3J",
//                   "arn": "arn:aws:iam::538235518685:role/Admin",
//                   "accountId": "538235518685",
//                   "userName": "Admin"
//               },
//               "webIdFederationData": {},
//               "attributes": {
//                   "mfaAuthenticated": "false",
//                   "creationDate": "2020-07-28T06:04:09Z"
//               }
//           }
//       },
//       "eventTime": "2020-07-28T11:35:28Z",
//       "eventSource": "organizations.amazonaws.com",
//       "eventName": "MoveAccount",
//       "awsRegion": "us-east-1",
//       "sourceIPAddress": "72.21.198.64",
//       "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:68.0) Gecko/20100101 Firefox/68.0, aws-internal/3 aws-sdk-java/1.11.820 Linux/4.9.217-0.1.ac.205.84.332.metal1.x86_64 OpenJDK_64-Bit_Server_VM/25.252-b09 java/1.8.0_252 vendor/Oracle_Corporation",
//       "requestParameters": {
//           "accountId": "549271133721",
//           "destinationParentId": "ou-yjkv-lmdswesj",
//           "sourceParentId": "ou-yjkv-hhd1qqua"
//       },
//       "responseElements": null,
//       "requestID": "3a2c6bcf-e07b-4767-8aa7-409759a53b05",
//       "eventID": "4256d14a-380d-40d2-9a4f-b10a9bab1ce6",
//       "eventType": "AwsApiCall"
//   }
// });
