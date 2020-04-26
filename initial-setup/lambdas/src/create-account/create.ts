import { AccountVendingMachine, CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';
import { ConfigurationAccount } from '../load-configuration-step';
import { ServiceCatalog } from '@aws-pbmm/common-lambda/lib/aws/service-catalog';

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
  return avm.createAccount({
    avmPortfolioName,
    avmProductName,
    ...account,
  });
};
