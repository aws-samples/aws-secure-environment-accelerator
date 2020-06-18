import { Account, QuarantineScpName } from '@aws-pbmm/common-outputs/lib/accounts';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { policyNameToAcceleratorPolicyName } from './add-scp-step';

interface DetachQuarantineScpInput {
  accounts: Account[];
  acceleratorPrefix: string;
}

const organizations = new Organizations();
export const handler = async (input: DetachQuarantineScpInput): Promise<string> => {
  console.log(`Creating account using Organizations...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, accounts } = input;

  // Find all policies in the organization
  const existingPolicies = await organizations.listPolicies({
    Filter: 'SERVICE_CONTROL_POLICY',
  });
  const policyName = policyNameToAcceleratorPolicyName({
    acceleratorPrefix,
    policyName: QuarantineScpName,
  });
  const existingPolicy = existingPolicies.find(p => p.Name === policyName);
  if (!existingPolicy) {
    console.log(`No SCP with name ${policyName} to detach from accounts`);
    return 'SUCCESS';
  }
  for (const account of accounts) {
    console.log(`Detaching policy "${policyName}"  from Account "${account.name}"`);
    try {
      await organizations.detachPolicy(existingPolicy.Id!, account.id);
    } catch (error) {
      if (error.code === 'PolicyNotAttachedException') {
        console.log(`"${policyName}" is not attached to Account "${account.name}"`);
      }
    }
  }
  return 'SUCCESS';
};
