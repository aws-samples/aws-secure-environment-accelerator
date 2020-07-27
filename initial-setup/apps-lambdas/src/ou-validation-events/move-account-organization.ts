import { Organizations, OrganizationalUnit } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { StepFunctions } from '@aws-pbmm/common-lambda/lib/aws/stepfunctions';
import * as org from 'aws-sdk/clients/organizations';
import { ScheduledEvent } from 'aws-lambda';
import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { AcceleratorConfig, AccountsConfig, AccountsConfigType } from '@aws-pbmm/common-lambda/lib/config';
import { delay } from '@aws-pbmm/common-lambda/lib/util/delay';
import { pascalCase } from 'pascal-case';
import * as crypto from 'crypto';
import { int } from 'aws-sdk/clients/datapipeline';

interface MoveAccountOrganization extends ScheduledEvent {
  version?: string;
}

const defaultRegion = process.env.ACCELERATOR_DEFAULT_REGION!;
const acceleratorStateMachinearn = process.env.ACCELERATOR_STATE_MACHINE_ARN!;
const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME! || 'PBMMAccel-Config-Repo';
const configFilePath = process.env.CONFIG_FILE_PATH! || 'config.json';
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
  const config = JSON.parse(configResponse.fileContent.toString());
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
      account: account,
      destinationOrg: destinationOrg,
      destinationRootOrg: destinationRootOrg,
      configBranch,
      configRepository: configRepositoryName,
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
        account: account,
        destinationOrg: destinationOrg,
        destinationRootOrg: destinationRootOrg,
        configBranch,
        configRepository: configRepositoryName,
      });
    }
  }
  // if (updatestatus === 'SUCCESS') {
  //   await delay(1000);
  //   await startStateMachine(acceleratorStateMachinearn);
  // }
  return 'SUCCESS';
};

async function updateConfig(props: {
  account: org.Account;
  configRepository: string;
  configBranch: string;
  destinationOrg: OrganizationalUnit;
  destinationRootOrg: string;
}) {
  const { configBranch, configRepository, account, destinationOrg, destinationRootOrg } = props;
  const configResponse = await codecommit.getFile(configRepository, 'config.json', configBranch);
  const config = JSON.parse(configResponse.fileContent.toString());
  const mandatoryAccountsPath = config['mandatory-account-configs']['__LOAD'];
  const mandatoryAccountsResponse = await codecommit.getFile(
    configRepository,
    mandatoryAccountsPath,
    configResponse.commitId,
  );
  const mandatoryAccounts: { [accountKey: string]: any } = JSON.parse(mandatoryAccountsResponse.fileContent.toString());
  const mandatoryAccountConfig = Object.entries(mandatoryAccounts).find(([_, value]) => value.email === account.Email!);
  let newAccount = true;
  if (mandatoryAccountConfig) {
    newAccount = false;
    const accountKey = mandatoryAccountConfig[0];
    const accountConfig = mandatoryAccountConfig[1];
    accountConfig.ou = destinationRootOrg;
    accountConfig['ou-path'] = destinationOrg.Path;
    mandatoryAccounts[accountKey] = accountConfig;
    try {
      await codecommit.commit({
        branchName: configBranch,
        repositoryName: configRepository,
        putFiles: [
          {
            filePath: mandatoryAccountsPath,
            fileContent: JSON.stringify(mandatoryAccounts, null, 2),
          },
        ],
        parentCommitId: mandatoryAccountsResponse.commitId,
      });
    } catch (error) {
      if (error.code === 'NoChangeException') {
        console.log(`Config is already update for account: ${accountKey}`);
      } else {
        throw Error(error);
      }
    }
  } else {
    const workLoadAccountsFiles = config['workload-account-configs']['__LOAD'];
    for (const workLoadAccountFile of workLoadAccountsFiles) {
      const localConfig = await codecommit.getFile(
        configRepository,
        workLoadAccountFile,
        mandatoryAccountsResponse.commitId,
      );
      const workLoadAccounts: { [accountKey: string]: any } = JSON.parse(localConfig.fileContent.toString());
      const workLoadAccountConfig = Object.entries(workLoadAccounts).find(
        ([_, value]) => value.email === account.Email!,
      );
      if (workLoadAccountConfig) {
        newAccount = false;
        const accountKey = workLoadAccountConfig[0];
        const accountConfig = workLoadAccountConfig[1];
        accountConfig.ou = destinationRootOrg;
        accountConfig['ou-path'] = destinationOrg.Path;
        workLoadAccounts[accountKey] = accountConfig;
        try {
          await codecommit.commit({
            branchName: configBranch,
            repositoryName: configRepository,
            putFiles: [
              {
                filePath: workLoadAccountFile,
                fileContent: JSON.stringify(workLoadAccounts, null, 2),
              },
            ],
            parentCommitId: localConfig.commitId,
          });
        } catch (error) {
          if (error.code === 'NoChangeException') {
            console.log(`Config is already update for account: ${accountKey}`);
          } else {
            throw Error(error);
          }
        }
        break;
      }
    }
  }

  if (newAccount) {
    const accountNamePrefix = config['workload-account-configs']['append-to-prefix'];
    const workLoadAccountsFiles: string[] = config['workload-account-configs']['__LOAD'];
    let suffix = 1;
    // TODO change w.r.t YAML
    let fileFormat = 'json';
    for (const acc of workLoadAccountsFiles) {
      if (acc.startsWith(accountNamePrefix)) {
        const s = parseInt(acc.split(accountNamePrefix)[1].split('.')[0]);
        if (s > suffix) {
          suffix = s;
        }
      }
    }
    const accountKey = `${pascalCase(account.Name!)}-${hashName(account.Email!, 6)}`;
    const accountConfig = {
      'account-name': account.Name!,
      email: account.Email!,
      ou: destinationRootOrg,
      'ou-path': destinationOrg.Path,
    };
    const accountsConfigFileResponse = await codecommit.getFile(
      configRepository,
      `${accountNamePrefix}${suffix}.${fileFormat}`,
      configBranch,
    );
    const accontsConfigFile = accountsConfigFileResponse.fileContent.toString();
    const lines = accontsConfigFile.split('\n');
    if (lines.length + 7 > 10) {
      suffix++;
      const filePath = `${accountNamePrefix}${suffix}.${fileFormat}`;
      workLoadAccountsFiles.push(filePath);
      config['workload-account-configs']['__LOAD'] = workLoadAccountsFiles;
      const accontsConfig: { [key: string]: unknown } = {};
      accontsConfig[accountKey] = accountConfig;
      try {
        await codecommit.commit({
          branchName: configBranch,
          repositoryName: configRepository,
          putFiles: [
            {
              filePath,
              fileContent: JSON.stringify(accontsConfig, null, 2),
            },
            {
              filePath: 'config.json',
              fileContent: JSON.stringify(config, null, 2),
            },
          ],
          parentCommitId: accountsConfigFileResponse.commitId,
        });
      } catch (error) {
        if (error.code === 'NoChangeException') {
          console.log(`Config is already update for account: ${accountKey}`);
        } else {
          throw Error(error);
        }
      }
    } else {
      const accontsConfig = JSON.parse(accontsConfigFile);
      accontsConfig[accountKey] = accountConfig;
      try {
        await codecommit.commit({
          branchName: configBranch,
          repositoryName: configRepository,
          putFiles: [
            {
              filePath: `${accountNamePrefix}${suffix}.${fileFormat}`,
              fileContent: JSON.stringify(accontsConfig, null, 2),
            },
          ],
          parentCommitId: accountsConfigFileResponse.commitId,
        });
      } catch (error) {
        if (error.code === 'NoChangeException') {
          console.log(`Config is already update for account: ${accountKey}`);
        } else {
          throw Error(error);
        }
      }
    }
  }
  return 'SUCCESS';
}
async function updateAccountConfig(
  account: org.Account,
  destinationOrg: OrganizationalUnit,
  destinationRootOrg: string,
): Promise<string> {
  console.log(`Updating Configuration for account "${account.Name}" to Organization ${destinationOrg.Name}`);
  const configCommit = await codecommit.getFile(configRepositoryName, configFilePath, configBranch);
  const parentCommitId = configCommit.commitId;
  const config = configCommit.fileContent.toString();
  const updateConfig = JSON.parse(config);
  const workLoadAccounts: AccountsConfig = updateConfig['workload-account-configs'];
  const mandatoryAccounts: AccountsConfig = updateConfig['mandatory-account-configs'];
  const workLoadAccountConfig = Object.entries(workLoadAccounts).find(([_, value]) => value.email === account.Email!);
  const mandatoryAccountConfig = Object.entries(mandatoryAccounts).find(([_, value]) => value.email === account.Email!);
  // tslint:disable-next-line: no-any
  let accountConfig: any;
  let accountKey: string = '';
  if (workLoadAccountConfig) {
    accountKey = workLoadAccountConfig[0];
    accountConfig = workLoadAccountConfig[1];
    accountConfig.ou = destinationRootOrg;
    accountConfig['ou-path'] = destinationOrg.Path;
    if (accountConfig.deleted) {
      accountConfig.deleted = false;
    }
  } else if (mandatoryAccountConfig) {
    accountKey = mandatoryAccountConfig[0];
    accountConfig = mandatoryAccountConfig[1];
    accountConfig.ou = destinationRootOrg;
    accountConfig['ou-path'] = destinationOrg.Path;
  } else {
    accountConfig = {
      'account-name': account.Name!,
      email: account.Email!,
      ou: destinationRootOrg,
      'ou-path': destinationOrg.Path,
    };
  }
  accountKey = accountKey || `${pascalCase(account.Name!)}-${hashName(account.Name!, 6)}`;
  if (mandatoryAccountConfig) {
    mandatoryAccounts[accountKey] = accountConfig;
    updateConfig['mandatory-account-configs'] = mandatoryAccounts;
  } else {
    workLoadAccounts[accountKey] = accountConfig;
    updateConfig['workload-account-configs'] = workLoadAccounts;
  }
  const commitStatus = await createCommit(updateConfig, parentCommitId);
  return commitStatus;
}

async function createCommit(config: AcceleratorConfig, parentCommitId: string): Promise<string> {
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
    return 'SUCCESS';
  } catch (error) {
    if (error.code === 'NoChangeException') {
      return 'NoChangeException';
    } else {
      throw new Error(error);
    }
  }
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
handler({
  version: '0',
  id: '417bfece-5f61-77ab-d486-2f1c70b59e6d',
  'detail-type': 'AWS API Call via CloudTrail',
  source: 'aws.organizations',
  account: '538235518685',
  time: '2020-07-27T14:48:46Z',
  region: 'us-east-1',
  resources: [],
  detail: {
    eventVersion: '1.05',
    userIdentity: {
      type: 'AssumedRole',
      principalId: 'AROAX2UKWH3O4FA6K6N3J:nkoppula-Isengard',
      arn: 'arn:aws:sts::538235518685:assumed-role/Admin/nkoppula-Isengard',
      accountId: '538235518685',
      accessKeyId: 'ASIAX2UKWH3OXYIJ6I4F',
      sessionContext: {
        sessionIssuer: {
          type: 'Role',
          principalId: 'AROAX2UKWH3O4FA6K6N3J',
          arn: 'arn:aws:iam::538235518685:role/Admin',
          accountId: '538235518685',
          userName: 'Admin',
        },
        webIdFederationData: {},
        attributes: {
          mfaAuthenticated: 'false',
          creationDate: '2020-07-27T14:45:26Z',
        },
      },
    },
    eventTime: '2020-07-27T14:48:46Z',
    eventSource: 'organizations.amazonaws.com',
    eventName: 'MoveAccount',
    awsRegion: 'us-east-1',
    sourceIPAddress: '72.21.198.66',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:68.0) Gecko/20100101 Firefox/68.0, aws-internal/3 aws-sdk-java/1.11.802 Linux/4.9.217-0.1.ac.205.84.332.metal1.x86_64 OpenJDK_64-Bit_Server_VM/25.252-b09 java/1.8.0_252 vendor/Oracle_Corporation',
    requestParameters: {
      accountId: '529267590244',
      destinationParentId: 'ou-67g4-tkkwz2w0',
      sourceParentId: 'r-67g4',
    },
    responseElements: null,
    requestID: 'b0a40d5e-9c88-4cd2-86b3-19f05e4f4042',
    eventID: '1f9667c6-f3a7-493d-b5ef-e884c39b463d',
    eventType: 'AwsApiCall',
  },
});
