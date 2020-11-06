import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { LoadConfigurationInput, ConfigurationAccount } from './load-configuration-step';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getItemInput, getUpdateItemInput } from './utils/dynamodb-requests';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';

export interface LoadAccountsInput extends LoadConfigurationInput {
  accountsItemsCountId: string;
  parametersTableName: string;
  itemId: string;
  accounts: ConfigurationAccount[];
  regions: string[];
}

export interface LoadAccountsOutput {
  accounts: string[];
  regions: string[];
}

const dynamoDB = new DynamoDB();
const organizations = new Organizations();

export const handler = async (input: LoadAccountsInput): Promise<LoadAccountsOutput> => {
  console.log(`Loading accounts...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    parametersTableName,
    itemId,
    accountsItemsCountId,
    configRepositoryName,
    configCommitId,
    configFilePath,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const ignoredOus = config['global-options']['ignored-ous'] || [];
  // First load mandatory accounts configuration
  const mandatoryAccounts = config.getMandatoryAccountConfigs();
  const mandatoryAccountKeys = mandatoryAccounts.map(([accountKey, _]) => accountKey);
  const organizationAccounts = await organizations.listAccounts();
  const activeAccounts = organizationAccounts.filter(account => account.Status === 'ACTIVE');

  const accounts = [];

  const chunk = (totalAccounts: Account[], size: number) =>
    Array.from({ length: Math.ceil(totalAccounts.length / size) }, (v, i) =>
      totalAccounts.slice(i * size, i * size + size),
    );

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const organizationAccount = activeAccounts.find(a => {
      return equalIgnoreCase(a.Email!, accountConfig.email);
    });

    // Find the organizational account used by this
    const organizationalUnitName = accountConfig.ou;

    if (ignoredOus.includes(organizationalUnitName)) {
      console.warn(`Account ${accountKey} found under ignored OU "${organizationalUnitName}"`);
      continue;
    }

    if (!organizationAccount) {
      if (!mandatoryAccountKeys.includes(accountKey)) {
        console.warn(
          `Cannot find non mandatory account with name "${accountConfig['account-name']}" and email "${accountConfig.email}"`,
        );
        continue;
      }
      throw new Error(
        `Cannot find account with name "${accountConfig['account-name']}" and email "${accountConfig.email}"`,
      );
    }

    accounts.push({
      key: accountKey,
      id: organizationAccount.Id!,
      arn: organizationAccount.Arn!,
      name: organizationAccount.Name!,
      email: organizationAccount.Email!,
      ou: accountConfig.ou,
      ouPath: accountConfig['ou-path'],
    });
  }

  const accountItemsCountItem = await dynamoDB.getItem(getItemInput(parametersTableName, accountsItemsCountId));
  const itemsCount = !accountItemsCountItem.Item ? 0 : Number(accountItemsCountItem.Item.value.S);

  // Removing existing accounts from dynamodb table
  for (let index = 0; index < itemsCount; index++) {
    await dynamoDB.deleteItem(getItemInput(parametersTableName, `${itemId}/${index}`));
  }

  // Splitting the accounts array to chunks of size 100
  const accountsChunk = chunk(accounts, 100);
  // Store the accounts configuration in the dynamodb
  for (const [index, accountChunk] of Object.entries(accountsChunk)) {
    await dynamoDB.updateItem(
      getUpdateItemInput(parametersTableName, `${itemId}/${index}`, JSON.stringify(accountChunk)),
    );
  }

  await dynamoDB.updateItem(
    getUpdateItemInput(parametersTableName, accountsItemsCountId, JSON.stringify(accountsChunk.length)),
  );

  const accountIds: string[] = accounts.map(acc => acc.id);
  return {
    ...input,
    accounts: accountIds,
  };
};
