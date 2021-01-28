import { CreateAccountOutput } from '@aws-accelerator/common/src/aws/types/account';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { ServiceControlPolicy } from '@aws-accelerator/common/src/scp';

interface AddQuarantineScpInput {
  accountId: string;
  acceleratorPrefix: string;
  organizationAdminRole: string;
}

const organizations = new Organizations();

export const handler = async (input: AddQuarantineScpInput): Promise<CreateAccountOutput> => {
  console.log(`Adding quarantine SCP to account...`);
  console.log(JSON.stringify(input, null, 2));

  const { accountId, acceleratorPrefix, organizationAdminRole } = input;

  await addQuarantineScp(acceleratorPrefix, organizationAdminRole, accountId);
  return {
    status: 'SUCCESS',
    provisionToken: `Account "${accountId}" successfully attached to Quarantine SCP`,
  };
};

async function addQuarantineScp(acceleratorPrefix: string, organizationAdminRole: string, accountId: string) {
  const scps = new ServiceControlPolicy(acceleratorPrefix, organizationAdminRole, organizations);
  const policyId = await scps.createOrUpdateQuarantineScp();

  console.log(`Attaching SCP "QNO SCP" to account "${accountId}"`);
  try {
    await organizations.attachPolicy(policyId, accountId);
  } catch (e) {
    console.warn(`Exception while attachPolicy`);
    if (e.errorType === 'DuplicatePolicyAttachmentException') {
      return;
    }
    const errorMessage = `${e}`;
    if (errorMessage.includes('DuplicatePolicyAttachmentException')) {
      return;
    }
    throw new Error(e);
  }
}
