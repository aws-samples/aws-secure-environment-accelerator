import { Organizations, OrganizationalUnit } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { StepFunctions } from '@aws-pbmm/common-lambda/lib/aws/stepfunctions';
import * as org from 'aws-sdk/clients/organizations';
import { ScheduledEvent } from 'aws-lambda';
import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { AcceleratorConfig, AccountsConfig } from '@aws-pbmm/common-lambda/lib/config';
import { delay } from '@aws-pbmm/common-lambda/lib/util/delay';
import { pascalCase } from 'pascal-case';
import * as crypto from 'crypto';

interface MoveAccountOrganization extends ScheduledEvent {
  version?: string;
}

const defaultRegion = process.env.ACCELERATOR_DEFAULT_REGION!;
const acceleratorStateMachinearn = process.env.ACCELERATOR_STATE_MACHINE_ARN!;
const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME!;
const configFilePath = process.env.CONFIG_FILE_PATH!;
const configBranch = process.env.CONFIG_BRANCH_NAME!;
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME!;

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
    updatestatus = await updateAccountConfig(account, destinationOrg, destinationRootOrg);
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
      updatestatus = await updateAccountConfig(account, destinationOrg, destinationRootOrg);
    }
  }
  if (updatestatus === 'SUCCESS') {
    await delay(1000);
    await startStateMachine(acceleratorStateMachinearn);
  }
  return 'SUCCESS';
};

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
  const workLoadAccountConfig = Object.entries(workLoadAccounts).find(
    ([_, value]) => value.email === account.Email!,
  );
  const mandatoryAccountConfig = Object.entries(mandatoryAccounts).find(
    ([_, value]) => value.email === account.Email!,
  );
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
