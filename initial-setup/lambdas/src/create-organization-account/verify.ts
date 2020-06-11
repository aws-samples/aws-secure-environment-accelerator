import { AccountAvailableOutput, AccountVendingMachine } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';
import { ConfigurationAccount } from '../load-configuration-step';

interface CheckStepInput {
  account: ConfigurationAccount;
}

export const handler = async (input: Partial<CheckStepInput>): Promise<AccountAvailableOutput> => {
  console.log(`Verifying status of provisioned account`);
  console.log(JSON.stringify(input, null, 2));

  const { account } = input;
  return {
    status: 'NON_MANDATORY_ACCOUNT_FAILURE',
    statusReason: `Skipping failure of non mandatory account validation "${account?.accountKey}"`,
  };
};