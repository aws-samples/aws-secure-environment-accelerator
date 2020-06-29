import { ConfigurationAccount } from '../load-configuration-step';
import { CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/types/account';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { createQuarantineScpContent, createQuarantineScpName } from '@aws-pbmm/common-lambda/lib/util/quarantine-scp';

interface AddQuarantineScpInput {
  account: ConfigurationAccount;
  acceleratorPrefix: string;
}

const organizations = new Organizations();

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

  const policyName = createQuarantineScpName({ acceleratorPrefix });
  const policyContent = createQuarantineScpContent({ acceleratorPrefix });

  const getPolicyByName = await organizations.getPolicyByName({
    Name: policyName,
    Filter: 'SERVICE_CONTROL_POLICY',
  });
  let policyId = getPolicyByName?.PolicySummary?.Id;
  if (policyId) {
    console.log(`Updating policy ${policyName}`);

    if (getPolicyByName?.Content !== policyContent) {
      await organizations.updatePolicy({
        policyId,
        content: policyContent,
      });
    }
  } else {
    console.log(`Creating policy ${policyName}`);

    const response = await organizations.createPolicy({
      type: 'SERVICE_CONTROL_POLICY',
      name: policyName,
      description: `${acceleratorPrefix}Quarantine policy - Apply to ACCOUNTS that need to be quarantined`,
      content: policyContent,
    });
    policyId = response.Policy?.PolicySummary?.Id!;
  }

  console.log(`Attaching SCP "${policyName}" to account "${account.accountId}"`);
  await organizations.attachPolicy(policyId, account.accountId);

  return {
    status: 'SUCCESS',
    provisionToken: `Account "${account.accountId}" successfully attached to Quarantine SCP`,
  };
};
