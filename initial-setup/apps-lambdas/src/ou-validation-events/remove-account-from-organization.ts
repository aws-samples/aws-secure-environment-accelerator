import { ScheduledEvent } from 'aws-lambda';
import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { AcceleratorConfig, AccountsConfig } from '@aws-pbmm/common-lambda/lib/config';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';

interface RemoveAccountOrganization extends ScheduledEvent {
  version?: string;
}

const defaultRegion = process.env.ACCELERATOR_DEFAULT_REGION!;
const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME!;
const configFilePath = process.env.CONFIG_FILE_PATH!;
const configBranch = process.env.CONFIG_BRANCH_NAME!;
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME!;
const acceleratorAccountsSecretId = process.env.ACCOUNTS_SECRET_ID!;
const codecommit = new CodeCommit(undefined, defaultRegion);
const secrets = new SecretsManager(undefined, defaultRegion);

export const handler = async (input: RemoveAccountOrganization) => {
  console.log(`RemoveAccountFromOrganization, Remove account configuration from Accelerator config...`);
  console.log(JSON.stringify(input, null, 2));
  const requestDetail = input.detail;
  const invokedBy = requestDetail.userIdentity.sessionContext.sessionIssuer.userName;
  if (invokedBy === acceleratorRoleName) {
    console.log(`Move Account Performed by Accelerator, No operation required`);
    return {
      status: 'NO_OPERATION_REQUIRED',
    };
  }
  console.log(`Reading account information from request`);
  const { accountId } = requestDetail.requestParameters;

  const accoutsString = await secrets.getSecret(acceleratorAccountsSecretId);
  const accounts = JSON.parse(accoutsString.SecretString!) as Account[];
  const account = accounts.find(acc => acc.id === accountId);
  if (!account) {
    console.error(`Account is not processed through Accelerator Statemachine "${accountId}"`);
    return;
  }
  await removeAccountConfig(account);
  return 'SUCCESS';
};

async function removeAccountConfig(account: Account): Promise<string> {
  console.log(`Removing Account "${account.name}" from Configuration`);
  const configCommit = await codecommit.getFile(configRepositoryName, configFilePath, configBranch);
  const parentCommitId = configCommit.commitId;
  const config = configCommit.fileContent.toString();
  const updateConfig = JSON.parse(config);
  const workLoadAccounts: AccountsConfig = updateConfig['workload-account-configs'];
  const mandatoryAccounts: AccountsConfig = updateConfig['mandatory-account-configs'];
  const workLoadAccountConfig = Object.entries(workLoadAccounts).find(
    ([_, value]) => value['account-name'] === account.name,
  );
  const mandatoryAccountConfig = Object.entries(mandatoryAccounts).find(
    ([_, value]) => value['account-name'] === account.name,
  );
  let accountKey: string = '';
  let isMandatoryAccount = false;
  if (workLoadAccountConfig) {
    accountKey = workLoadAccountConfig[0];
  } else if (mandatoryAccountConfig) {
    accountKey = mandatoryAccountConfig[0];
    isMandatoryAccount = true;
  } else {
    console.log(`Account Config not found in Accelerator Configuration ${account.id}`);
  }
  accountKey = accountKey || account.name;
  if (isMandatoryAccount) {
    console.log(`Nothing to perform`);
  } else {
    delete workLoadAccounts[accountKey];
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
