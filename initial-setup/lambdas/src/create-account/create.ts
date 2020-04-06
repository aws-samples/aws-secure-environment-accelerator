import { AccountVendingMachine, CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';

interface CreateMasterExecutionRoleInput {
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
  isMasterAccount: boolean;
  lambdaRoleArn: string;
}

export const handler = async (input: CreateMasterExecutionRoleInput): Promise<CreateAccountOutput> => {
  console.log(`Creating account using AVM...`);
  console.log(JSON.stringify(input, null, 2));

  const { accountName, emailAddress, organizationalUnit, isMasterAccount, lambdaRoleArn } = input;

  // TODO Find a better way to detect the master account
  if (isMasterAccount) {
    return {
      status: 'NOT_RELEVANT',
      statusReason: 'Skipping creation of master account'
    }
  }

  // create account using account-vending-machine
  const avm = new AccountVendingMachine();

  return avm.createAccount({
    accountName,
    emailAddress,
    organizationalUnit,
    lambdaRoleArn,
  });
};
