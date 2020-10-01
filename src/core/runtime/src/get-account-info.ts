import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';
import { MandatoryAccountType } from '@aws-accelerator/common-config';
import { loadAccounts } from './utils/load-accounts';

export interface GetAccountInfoInput extends LoadConfigurationInput {
  accountId?: string;
  accountType?: MandatoryAccountType;
  accountsTableName?: string;
}

const organizations = new Organizations();
const dynamodb = new DynamoDB();
export const handler = async (input: GetAccountInfoInput) => {
  console.log(`Get Account Info...`);
  console.log(JSON.stringify(input, null, 2));

  const { accountId, configCommitId, configFilePath, configRepositoryName, accountType, accountsTableName } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  if (accountType) {
    const mandatoryAccountKey = acceleratorConfig.getMandatoryAccountKey(accountType);
    const accounts = await loadAccounts(accountsTableName!, dynamodb);
    const mandatoryAccount = accounts.find(acc => acc.key === mandatoryAccountKey);
    const rootOrg = await organizations.describeOrganization();
    if (!mandatoryAccount) {
      throw new Error(`${accountType} account not found`);
    }
    // Setting Root Organization if in "OU"
    mandatoryAccount.ou = rootOrg?.Id!;
    return mandatoryAccount;
  }
  const awsAccount = await organizations.getAccount(accountId!);
  if (!awsAccount) {
    throw new Error(`Unable retrive account from Organizations api for "${accountId}"`);
  }
  const configAccount = acceleratorConfig
    .getAccountConfigs()
    .find(([_, accountConfig]) => equalIgnoreCase(accountConfig.email, awsAccount.Email!));
  if (!configAccount) {
    throw new Error(`Account didn't find in Configuration "${accountId}" with email ${awsAccount.Email}`);
  }
  const accountKey = configAccount?.[0];
  const ou = configAccount?.[1].ou;
  const ouPath = configAccount?.[1]['ou-path'];
  const account: Account = {
    arn: awsAccount.Arn!,
    email: awsAccount.Email!,
    id: accountId!,
    key: accountKey,
    name: awsAccount.Name!,
    ou,
    ouPath,
  };
  return account;
};
