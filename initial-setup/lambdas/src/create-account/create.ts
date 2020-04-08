import { AccountVendingMachine, CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';

interface CreateMasterExecutionRoleInput {
  avmPortfolioName: string;
  avmProductName: string;
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
  isMasterAccount: boolean;
}

export const handler = async (input: CreateMasterExecutionRoleInput): Promise<CreateAccountOutput> => {
  console.log(`Creating account using AVM...`);
  console.log(JSON.stringify(input, null, 2));

  // TODO Find a better way to detect the master account
  if (input.isMasterAccount) {
    return {
      status: 'NOT_RELEVANT',
      statusReason: 'Skipping creation of master account',
    };
  }

  const avm = new AccountVendingMachine();

  // create account using account-vending-machine
  return avm.createAccount(input);
};
