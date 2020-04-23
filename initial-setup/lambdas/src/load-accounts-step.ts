import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { LoadConfigurationOutput } from './load-configuration-step';
import { LandingZoneAccountType } from '@aws-pbmm/common-lambda/lib/config';

export interface LoadAccountsInput {
  accountsSecretId: string;
  configuration: LoadConfigurationOutput;
}

export type LoadAccountsOutput = Account[];

export interface Account {
  key: string;
  id: string;
  arn: string;
  name: string;
  email: string;
  ou: string;
  type?: LandingZoneAccountType;
}

export const handler = async (input: LoadAccountsInput): Promise<LoadAccountsOutput> => {
  console.log(`Loading accounts...`);
  console.log(JSON.stringify(input, null, 2));

  const { accountsSecretId, configuration } = input;

  // The first step is to load all the execution roles
  const organizations = new Organizations();
  const organizationAccounts = await organizations.listAccounts();

  const accounts = [];
  for (const accountConfig of configuration.accounts) {
    let organizationAccount;
    if (accountConfig.landingZoneAccountType === 'primary') {
      // Only filter on the email address if we are dealing with the master account
      organizationAccount = organizationAccounts.find(a => {
        return a.Email === accountConfig.emailAddress;
      });
    } else {
      organizationAccount = organizationAccounts.find(a => {
        return a.Name === accountConfig.accountName && a.Email === accountConfig.emailAddress;
      });
    }
    if (!organizationAccount) {
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
    });
  }

  // Store the accounts configuration in the accounts secret
  const secrets = new SecretsManager();
  await secrets.putSecretValue({
    SecretId: accountsSecretId,
    SecretString: JSON.stringify(accounts),
  });

  // Find all relevant accounts in the organization
  return accounts;
};
