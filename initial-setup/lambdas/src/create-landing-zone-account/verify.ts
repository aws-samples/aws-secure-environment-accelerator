import { AccountVendingMachine } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';
import { ConfigurationAccount } from '../load-configuration-step';
import { AccountAvailableOutput } from '@aws-pbmm/common-lambda/lib/aws/types/account';

interface CheckStepInput {
  account: ConfigurationAccount;
}

export const handler = async (input: Partial<CheckStepInput>): Promise<AccountAvailableOutput> => {
  console.log(`Verifying status of provisioned account`);
  console.log(JSON.stringify(input, null, 2));

  const { account } = input;

  const avm = new AccountVendingMachine();

  // Check the status of the provisioned account.
  const verifyAccountOutput = await avm.isAccountAvailable(account?.accountName!);

  if (account && !account.isMandatoryAccount) {
    const status = verifyAccountOutput.status;
    if (status && status === 'FAILURE') {
      return {
        status: 'NON_MANDATORY_ACCOUNT_FAILURE',
        statusReason: `Skipping failure of non mandatory account validation "${account.accountKey}"`,
      };
    }
  }
  return verifyAccountOutput;
};
