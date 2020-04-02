import { Context } from 'aws-lambda';
import { AVM } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';

interface CreateMasterExecutionRoleInput {
  accountName: string;
}

export const handler = async (input: CreateMasterExecutionRoleInput, context: Context) => {
  console.log(`Creating account using AVM...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    accountName,
  } = input;

  // create account using account-vending-machine
  const avm = new AVM();
  return await avm.createAccount(accountName);
};
