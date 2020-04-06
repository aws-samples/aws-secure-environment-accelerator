import { Context } from 'aws-lambda';
import { AccountVendingMachine } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';

interface CreateMasterExecutionRoleInput {
  jobId: string;
  accountName: string;
  lambdaRoleArn: string;
  acceleratorConfigSecretArn: string;
}

export const handler = async (input: CreateMasterExecutionRoleInput, context: Context) => {
  console.log(`Creating account using AVM...`);
  console.log(JSON.stringify(input, null, 2));

  const { jobId, accountName, lambdaRoleArn, acceleratorConfigSecretArn } = input;
  console.log('input: ', input);

  // create account using account-vending-machine
  const avm = new AccountVendingMachine();
  return avm.createAccount(accountName, lambdaRoleArn, acceleratorConfigSecretArn);
};
