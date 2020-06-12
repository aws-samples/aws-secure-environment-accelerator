import { ConfigurationAccount } from '../load-configuration-step';
import { CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/types/account';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';

const org = new Organizations();
export const handler = async (account: ConfigurationAccount): Promise<CreateAccountOutput> => {
  console.log(`Creating account using Organizations...`);
  console.log(JSON.stringify(account, null, 2));

  if (account.accountId) {
    return {
      status: 'ALREADY_EXISTS',
      statusReason: `Skipping creation of account "${account.landingZoneAccountType}" with ID "${account.accountId}"`,
    };
  }

  const { accountName, emailAddress } = account;

  const accountResponse = await org.createAccount(emailAddress, accountName);
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
