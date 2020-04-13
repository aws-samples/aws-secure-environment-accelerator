import { AccountVendingMachine, CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';
import { LandingZoneAccountType, ConfigurationAccount } from '../load-configuration-step';

interface CreateMasterExecutionRoleInput {
  avmPortfolioName: string;
  avmProductName: string;
  account: ConfigurationAccount;
}

export const handler = async (input: CreateMasterExecutionRoleInput): Promise<CreateAccountOutput> => {
  console.log(`Creating account using AVM...`);
  console.log(JSON.stringify(input, null, 2));

  const { avmPortfolioName, avmProductName, account } = input;

  // TODO Find a better way to detect the master account
  if (account.landingZoneAccountType) {
    return {
      status: 'NOT_RELEVANT',
      statusReason: `Skipping creation of Landing Zone account "${account.landingZoneAccountType}"`,
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
