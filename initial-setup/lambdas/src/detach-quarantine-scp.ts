import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { createQuarantineScpName } from './create-organization-account/add-quarantine-scp';

interface DetachQuarantineScpInput {
  accounts: Account[];
  acceleratorPrefix: string;
}

const organizations = new Organizations();
export const handler = async (input: DetachQuarantineScpInput): Promise<string> => {
  console.log(`Creating account using Organizations...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, accounts } = input;

  const policyName = createQuarantineScpName({ acceleratorPrefix });

  // Find all policies in the organization
  const policy = await organizations.getPolicyByName({
    Filter: 'SERVICE_CONTROL_POLICY',
    Name: policyName,
  });
  const policyId = policy?.PolicySummary?.Id;
  if (!policyId) {
    console.log(`No SCP with name ${policyName} to detach from accounts`);
    return 'SUCCESS';
  }
  for (const account of accounts) {
    console.log(`Detaching policy "${policyName}" from account "${account.name}"`);
    try {
      await organizations.detachPolicy(policyId, account.id);
    } catch (e) {
      if (e.code === 'PolicyNotAttachedException') {
        console.log(`"${policyName}" is not attached to account "${account.name}"`);
        continue;
      }
      throw e;
    }
  }
  return 'SUCCESS';
};
