import { CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/types/account';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { ServiceControlPolicy } from '@aws-pbmm/common-lambda/lib/scp';

interface AddQuarantineScpInput {
  accountId: string;
  acceleratorPrefix: string;
}

const organizations = new Organizations();

export const handler = async (input: AddQuarantineScpInput): Promise<CreateAccountOutput> => {
  console.log(`Adding quarantine SCP to account...`);
  console.log(JSON.stringify(input, null, 2));

  const { accountId, acceleratorPrefix } = input;

  await addQuarantineScp(acceleratorPrefix, accountId);
  return {
    status: 'SUCCESS',
    provisionToken: `Account "${accountId}" successfully attached to Quarantine SCP`,
  };
};

async function addQuarantineScp(acceleratorPrefix: string, accountId: string) {
  const scps = new ServiceControlPolicy(acceleratorPrefix, organizations);
  const policyId = await scps.createOrUpdateQuarantineScp();

  console.log(`Attaching SCP "QNO SCP" to account "${accountId}"`);
  await organizations.attachPolicy(policyId, accountId);
}
