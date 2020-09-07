import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { ServiceControlPolicy } from '@aws-accelerator/common/src/scp';
import { loadAccounts } from './utils/load-accounts';

interface DetachQuarantineScpInput {
  acceleratorPrefix: string;
  parametersTableName: string;
}

const organizations = new Organizations();
const dynamodb = new DynamoDB();
export const handler = async (input: DetachQuarantineScpInput): Promise<string> => {
  console.log(`Creating account using Organizations...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, parametersTableName } = input;
  const accounts = await loadAccounts(parametersTableName, dynamodb);

  const policyName = ServiceControlPolicy.createQuarantineScpName({ acceleratorPrefix });

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
