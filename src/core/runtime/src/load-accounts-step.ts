import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { LoadConfigurationOutput, ConfigurationOrganizationalUnit } from './load-configuration-step';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getItemInput, getUpdateItemInput } from './utils/dynamodb-requests';

export interface LoadAccountsInput {
  accountItemsCountSecretId: string;
  parametersTableName: string;
  itemId: string;
  configuration: LoadConfigurationOutput;
}

export interface LoadAccountsOutput {
  organizationalUnits: ConfigurationOrganizationalUnit[];
  accounts: Account[];
  regions: string[];
}

const dynamoDB = new DynamoDB();
const secrets = new SecretsManager();

export const handler = async (input: LoadAccountsInput): Promise<LoadAccountsOutput> => {
  console.log(`Loading accounts...`);
  console.log(JSON.stringify(input, null, 2));

  const { parametersTableName, configuration, itemId, accountItemsCountSecretId } = input;

  // The first step is to load all the execution roles
  const organizations = new Organizations();
  const organizationAccounts = await organizations.listAccounts();
  const activeAccounts = organizationAccounts.filter(account => account.Status === 'ACTIVE');

  const accounts = [];

  const chunk = (accounts: Account[], size: number) =>
    Array.from({ length: Math.ceil(accounts.length / size) }, (v, i) => accounts.slice(i * size, i * size + size));

  for (const accountConfig of configuration.accounts) {
    let organizationAccount;
    organizationAccount = activeAccounts.find(a => {
      return equalIgnoreCase(a.Email!, accountConfig.emailAddress);
    });

    // TODO Removing "landingZoneAccountType" check for mandatory account. Can be replaced with "accountName" after proper testing
    // if (accountConfig.landingZoneAccountType === 'primary') {
    //   // Only filter on the email address if we are dealing with the master account
    //   organizationAccount = organizationAccounts.find(a => {
    //     return a.Email === accountConfig.emailAddress;
    //   });
    // } else {
    //   organizationAccount = organizationAccounts.find(a => {
    //     return a.Name === accountConfig.accountName && a.Email === accountConfig.emailAddress;
    //   });
    // }
    if (!organizationAccount) {
      if (!accountConfig.isMandatoryAccount) {
        console.warn(
          `Cannot find non mandatory account with name "${accountConfig.accountName}" and email "${accountConfig.emailAddress}"`,
        );
        continue;
      }
      throw new Error(
        `Cannot find account with name "${accountConfig.accountName}" and email "${accountConfig.emailAddress}"`,
      );
    }

    accounts.push({
      key: accountConfig.accountKey,
      id: organizationAccount.Id!,
      arn: organizationAccount.Arn!,
      name: organizationAccount.Name!,
      email: organizationAccount.Email!,
      ou: accountConfig.organizationalUnit,
      type: accountConfig.landingZoneAccountType,
      ouPath: accountConfig.ouPath,
    });
  }

  const itemsCountSecret = await secrets.getSecret(accountItemsCountSecretId);
  const itemsCount = Number(itemsCountSecret.SecretString);

  // Removing existing accounts from dynamodb table
  for (let index = 0; index < itemsCount; index++) {
    await dynamoDB.deleteItem(getItemInput(parametersTableName, `${itemId}/${index}`));
  }

  // Splitting the accounts array to chunks of size 100
  const accountsChunk = chunk(accounts, 100);
  // Store the accounts configuration in the dynamodb
  for (const [index, accounts] of Object.entries(accountsChunk)) {
    await dynamoDB.updateItem(getUpdateItemInput(parametersTableName, `${itemId}/${index}`, JSON.stringify(accounts)));
  }

  await secrets.putSecretValue({
    SecretId: accountItemsCountSecretId,
    SecretString: JSON.stringify(accountsChunk.length),
  });

  // Find all relevant accounts in the organization
  return {
    ...configuration,
    accounts,
  };
};
