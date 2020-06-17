import { ConfigurationAccount, LoadConfigurationInput } from '../load-configuration-step';
import { CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/types/account';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';

interface CreateOrganizationAccountInput extends LoadConfigurationInput {
  account: ConfigurationAccount;
};
const org = new Organizations();
export const handler = async (input: CreateOrganizationAccountInput): Promise<CreateAccountOutput> => {
  console.log(`Creating account using Organizations...`);
  console.log(JSON.stringify(input, null, 2));

  const { account, configRepositoryName, configFilePath, configCommitId } = input;

  if (account.accountId) {
    return {
      status: 'ALREADY_EXISTS',
      statusReason: `Skipping creation of account "${account.accountKey}" with ID "${account.accountId}"`,
    };
  }

  const { accountName, emailAddress } = account;

  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const roleName = config["global-options"]["organization-admin-role"];
  
  // const accountResponse = await org.createAccount(emailAddress, accountName, roleName);
  const accountResponse = await org.createAccount(emailAddress, accountName, roleName);
  const response = accountResponse;
  // TODO Handle more failure cases
  if (!response) {
    if (!account.isMandatoryAccount) {
      return {
        status: 'NON_MANDATORY_ACCOUNT_FAILURE',
        statusReason: `Skipping failure of non mandatory account creation "${account.accountKey}"`,
      };
    } else {
      return {
        status: 'ALREADY_EXISTS',
        statusReason: `failure of mandatory account creation "${account.accountKey}"`,
      };
    }
  }
  if (!account.isMandatoryAccount) {
    if (response.State === 'FAILURE') {
      console.log(response.FailureReason);
      return {
        status: 'NON_MANDATORY_ACCOUNT_FAILURE',
        statusReason: `Skipping failure of non mandatory account creation "${account.accountKey}"`,
      };
    }
  }
  return {
    status: response.State!,
    provisionToken: response.Id,
  };
};
