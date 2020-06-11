import { CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';
import { ConfigurationAccount } from '../load-configuration-step';

interface CreateMasterExecutionRoleInput {
  account: ConfigurationAccount;
}

export const handler = async (input: CreateMasterExecutionRoleInput): Promise<CreateAccountOutput> => {
  console.log(`Creating account using Organizations...`);
  console.log(JSON.stringify(input, null, 2));

  const { account } = input;

  if (account.accountId) {
    return {
      status: 'ALREADY_EXISTS',
      statusReason: `Skipping creation of account "${account.landingZoneAccountType}" with ID "${account.accountId}"`,
    };
  }

  return {
    status: 'ALREADY_EXISTS',
    statusReason: `Skipping creation of account "${account.landingZoneAccountType}" with ID "${account.accountId}"`,
  };
};
