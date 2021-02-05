import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { LoadConfigurationInput, ConfigurationAccount } from './load-configuration-step';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getItemInput, getUpdateItemInput } from './utils/dynamodb-requests';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';


export interface SMInput {
  scope?: 'FULL' | 'NEW-ACCOUNTS' | 'GLOBAL-OPTIONS' | 'ACCOUNT' | 'OU';
  mode?: 'APPLY';
  loadOus?: string[];
  loadAccounts?: string[];
}
export interface LoadAccountsInput extends LoadConfigurationInput {
  accountsItemsCountId: string;
  parametersTableName: string;
  itemId: string;
  accounts: ConfigurationAccount[];
  regions: string[];
  smInput: SMInput;
}

export interface LoadAccountsOutput {
  accounts: string[];
  regions: string[];
  scope: 'FULL' | 'NEW-ACCOUNTS' | 'GLOBAL-OPTIONS' | 'ACCOUNT' | 'OU';
  mode: 'APPLY';
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
    accounts,
    smInput,
  } = input;
  
  const {loadAccounts, loadOus, mode, scope } = smInput;

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

  const returnAccounts = [];

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
    if (organizationAccount.Status === 'SUSPENDED') {
      console.warn(`Account ${accountKey} is suspended`);
      continue;
    }
    let accountScope: boolean = true;
    if (!scope || scope === 'NEW-ACCOUNTS') {
      accountScope =
        mandatoryAccountKeys.includes(accountKey) || !!accounts.find(acc => acc.accountId === organizationAccount.Id);
    } else if (scope === 'ACCOUNT') {
      accountScope =
        mandatoryAccountKeys.includes(accountKey) ||
        (!!loadAccounts &&
          !!organizationAccount.Id &&
          loadAccounts.length > 0 &&
          loadAccounts.includes(organizationAccount.Id));
    } else if (scope === 'OU') {
      accountScope =
        mandatoryAccountKeys.includes(accountKey) ||
        (!!loadOus && loadOus.length > 0 && loadOus.includes(accountConfig.ou));
    } else if (['FULL', 'GLOBAL-OPTIONS'].includes(scope)) {
      accountScope = true;
    }

    returnAccounts.push({
      key: accountKey,
      id: organizationAccount.Id!,
      arn: organizationAccount.Arn!,
      name: organizationAccount.Name!,
      email: organizationAccount.Email!,
      ou: accountConfig.ou,
      ouPath: accountConfig['ou-path'],
      isMandatory: mandatoryAccountKeys.includes(accountKey),
      isNew: !!accounts.find(acc => acc.accountId === organizationAccount.Id),
      inScope: accountScope,
    });
  }

  const accountItemsCountItem = await dynamoDB.getItem(getItemInput(parametersTableName, accountsItemsCountId));
  const itemsCount = !accountItemsCountItem.Item ? 0 : Number(accountItemsCountItem.Item.value.S);

  // Removing existing accounts from dynamodb table
  for (let index = 0; index < itemsCount; index++) {
    await dynamoDB.deleteItem(getItemInput(parametersTableName, `${itemId}/${index}`));
  }

  // Splitting the accounts array to chunks of size 100
  const accountsChunk = chunk(returnAccounts, 100);
  // Store the accounts configuration in the dynamodb
  for (const [index, accountChunk] of Object.entries(accountsChunk)) {
    await dynamoDB.updateItem(
      getUpdateItemInput(parametersTableName, `${itemId}/${index}`, JSON.stringify(accountChunk)),
    );
  }

  await dynamoDB.updateItem(
    getUpdateItemInput(parametersTableName, accountsItemsCountId, JSON.stringify(accountsChunk.length)),
  );

  const accountIds: string[] = [];
  if (scope === 'FULL') {
    console.log('Scope is "FULL", Deploying in all accounts');
    accountIds.push(...returnAccounts.map(acc => acc.id));
  } else if (!scope || scope === 'NEW-ACCOUNTS') {
    console.log('Scope is "NEW-ACCOUNTS", Deploying in mandatory and new accounts');
    accountIds.push(
      ...returnAccounts.filter(acc => acc.isMandatory).map(a => a.id),
      ...returnAccounts.filter(acc => acc.isNew).map(a => a.id),
    );
  }
  return {
    ...input,
    // Return based on execution scope.
    accounts: accountIds,
    scope: scope || 'NEW-ACCOUNTS',
    mode: mode || 'APPLY',
  };
};
