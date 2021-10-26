/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { LoadConfigurationInput, ConfigurationAccount } from './load-configuration-step';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getItemInput, getUpdateItemInput } from './utils/dynamodb-requests';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { loadAccounts } from './utils/load-accounts';

export interface SMInput {
  scope?: 'FULL' | 'NEW-ACCOUNTS' | 'GLOBAL-OPTIONS' | 'ACCOUNT' | 'OU';
  mode?: 'APPLY';
  verbose?: string | number;
  targetOus?: string[];
  targetAccounts?: string[];
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
  verbose: string | '1' | '0';
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

  const { targetAccounts, targetOus, mode, scope, verbose } = smInput;

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
  const existingAccounts: Account[] = await loadAccounts(parametersTableName, dynamoDB);
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

    // Set inScope in account object based on "scope", "targetAccounts" and "targetOus"
    let accountScope: boolean = true;
    if (!scope || scope === 'NEW-ACCOUNTS') {
      accountScope =
        mandatoryAccountKeys.includes(accountKey) ||
        !!accounts.find(acc => acc.accountId === organizationAccount.Id) ||
        !existingAccounts.find(acc => acc.id === organizationAccount.Id);
    } else if (scope === 'ACCOUNT') {
      if (targetAccounts && targetAccounts.length > 0) {
        accountScope =
          // LOAD Mandatory Accounts irrespective of targetAccounts
          mandatoryAccountKeys.includes(accountKey) ||
          // LOAD NEW accounts if scope="ACCOUNT", "NEW" in targetAccounts
          (targetAccounts.includes('NEW') &&
            (!!accounts.find(acc => acc.accountId === organizationAccount.Id) ||
              !existingAccounts.find(acc => acc.id === organizationAccount.Id))) ||
          // LOAD ALL accounts if scope="ACCOUNT", "ALL" in targetAccounts
          targetAccounts.includes('ALL') ||
          // LOAD accounts which are in targetAccounts if scope="ACCOUNT", account in targetAccounts
          (!!organizationAccount.Id && targetAccounts.includes(organizationAccount.Id));
      } else {
        // Load Only mandatory accounts if scope="ACCOUNT", targetAccounts is null
        accountScope = mandatoryAccountKeys.includes(accountKey);
      }
    } else if (scope === 'OU') {
      if (targetOus && targetOus.length > 0) {
        accountScope =
          // LOAD Mandatory Accounts irrespective of targetOus
          mandatoryAccountKeys.includes(accountKey) ||
          // LOAD ALL accounts if scope="OU", "ALL" in targetOus
          targetOus.includes('ALL') ||
          // LOAD accounts which are under OU in targetOus if scope="OU", ou in targetOus
          (!!targetOus && targetOus.length > 0 && targetOus.includes(accountConfig.ou));
      } else {
        // Load Only mandatory accounts if scope="OU", targetOus is null
        accountScope = mandatoryAccountKeys.includes(accountKey);
      }
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
      isDeployed: !!existingAccounts.find(acc => acc.id === organizationAccount.Id),
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

  const accountIds: string[] = returnAccounts.filter(acc => acc.inScope).map(a => a.id);
  return {
    ...input,
    // Return based on execution scope.
    accounts: accountIds,
    scope: scope || 'NEW-ACCOUNTS',
    mode: mode || 'APPLY',
    verbose: verbose ? `${verbose}` : '0',
  };
};
