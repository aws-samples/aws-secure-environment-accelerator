import { ConfigurationAccount } from '../load-configuration-step';
import { CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/types/account';
import { ServiceControlPolicy } from '@aws-pbmm/common-lambda/lib/scp';

interface AddQuarantineScpInput {
  account: ConfigurationAccount;
  acceleratorPrefix: string;
}

export const handler = async (input: AddQuarantineScpInput): Promise<CreateAccountOutput> => {
  console.log(`Adding quarantine SCP to account...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, account } = input;

  if (!account.accountId) {
    return {
      status: 'FAILED',
      statusReason: `Skipping adding SCP of account "${account.accountKey}"`,
    };
  }

  // TODO Replace with scp class from config
  const scps = new ServiceControlPolicy(acceleratorPrefix);
  await scps.createOrUpdateQuarantineScp([account.accountId]);

  return {
    status: 'SUCCESS',
    provisionToken: `Account "${account.accountId}" successfully attached to Quarantine SCP`,
  };
};
