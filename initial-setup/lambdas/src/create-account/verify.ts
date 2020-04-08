import { AccountAvailableOutput, AccountVendingMachine } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';

interface CheckStepInput {
  accountName: string;
  provisionToken: string;
}

export const handler = async (input: Partial<CheckStepInput>): Promise<AccountAvailableOutput> => {
  console.log(`Verifying status of provisioned account with parameters ${JSON.stringify(input, null, 2)}`);

  const { accountName, provisionToken } = input;

  const avm = new AccountVendingMachine();
  
  // Check the status of the provisioned account.
  return avm.isAccountAvailable(accountName!, provisionToken!);
};
