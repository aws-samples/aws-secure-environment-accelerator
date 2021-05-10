import { AccountVendingMachine } from '@aws-accelerator/common/src/aws/account-vending-machine';
import { ConfigurationAccount } from '../load-configuration-step';
import { CreateAccountOutput } from '@aws-accelerator/common/src/aws/types/account';

interface CreateMasterExecutionRoleInput {
  avmPortfolioName: string;
  avmProductName: string;
  account: ConfigurationAccount;
}

export const handler = async (input: CreateMasterExecutionRoleInput): Promise<CreateAccountOutput> => {
  console.log(`Creating account using AVM...`);
  console.log(JSON.stringify(input, null, 2));

  const { avmPortfolioName, avmProductName, account } = input;

  if (account.landingZoneAccountType) {
    return {
      status: 'NOT_RELEVANT',
      statusReason: `Skipping creation of Landing Zone account "${account.landingZoneAccountType}"`,
    };
  } else if (account.accountId) {
    return {
      status: 'ALREADY_EXISTS',
      statusReason: `Skipping creation of account "${account.landingZoneAccountType}" with ID "${account.accountId}"`,
    };
  }

  const avm = new AccountVendingMachine();

  // create account using account-vending-machine
  const createAccountOutput = await avm.createAccount({
    avmPortfolioName,
    avmProductName,
    ...account,
  });

  if (!account.isMandatoryAccount) {
    const status = createAccountOutput.status;
    if (status && status === 'FAILURE') {
      return {
        status: 'NON_MANDATORY_ACCOUNT_FAILURE',
        statusReason: `Skipping failure of non mandatory account creation "${account.accountKey}"`,
      };
    }
  }
  return createAccountOutput;
};
