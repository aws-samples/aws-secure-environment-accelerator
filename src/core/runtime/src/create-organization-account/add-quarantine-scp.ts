import { ConfigurationAccount } from '../load-configuration-step';
import { CreateAccountOutput } from '@aws-accelerator/common/src/aws/types/account';
import { ServiceControlPolicy } from '@aws-accelerator/common/src/scp';

interface AddQuarantineScpInput {
  account: ConfigurationAccount;
  acceleratorPrefix: string;
  acceleratorName: string;
  region: string;
  organizationAdminRole: string;
}

export const handler = async (input: AddQuarantineScpInput): Promise<CreateAccountOutput> => {
  console.log(`Adding quarantine SCP to account...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, account, organizationAdminRole, acceleratorName, region } = input;

  if (!account.accountId) {
    return {
      status: 'FAILED',
      statusReason: `Skipping adding SCP of account "${account.accountKey}"`,
    };
  }

  const scps = new ServiceControlPolicy({
    acceleratorPrefix,
    acceleratorName,
    region,
    organizationAdminRole,
  });
  await scps.createOrUpdateQuarantineScp([account.accountId]);

  return {
    status: 'SUCCESS',
    provisionToken: `Account "${account.accountId}" successfully attached to Quarantine SCP`,
  };
};
