import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { LoadConfigurationOutput, ConfigurationOrganizationalUnit } from './load-configuration-step';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';

export interface LoadAccountsInput {
  accountsSecretId: string;
  configuration: LoadConfigurationOutput;
}

export interface LoadAccountsOutput {
  organizationalUnits: ConfigurationOrganizationalUnit[];
  accounts: Account[];
  regions: string[];
}

export const handler = async (input: LoadAccountsInput): Promise<LoadAccountsOutput> => {
  console.log(`Loading accounts...`);
  console.log(JSON.stringify(input, null, 2));

  const { accountsSecretId, configuration } = input;

  // The first step is to load all the execution roles
  const organizations = new Organizations();
  const organizationAccounts = await organizations.listAccounts();
  const activeAccounts = organizationAccounts.filter(account => account.Status === 'ACTIVE');

  const accounts = [];
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

  // Store the accounts configuration in the accounts secret
  const secrets = new SecretsManager();
  await secrets.putSecretValue({
    SecretId: accountsSecretId,
    SecretString: JSON.stringify(accounts),
  });

  // Find all relevant accounts in the organization
  return {
    ...configuration,
    accounts,
  };
};
