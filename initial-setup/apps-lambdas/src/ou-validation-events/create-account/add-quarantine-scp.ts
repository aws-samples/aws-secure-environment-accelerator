import { CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/types/account';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';

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

  console.log(`Attaching SCP "${policyName}" to account "${accountId}"`);
  await organizations.attachPolicy(policyId, accountId);
}

export function createQuarantineScpName(props: { acceleratorPrefix: string }) {
  return `${props.acceleratorPrefix}Quarantine-New-Object`;
}

export function createQuarantineScpContent(props: { acceleratorPrefix: string }) {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'DenyAllAWSServicesExceptBreakglassRoles',
        Effect: 'Deny',
        Action: '*',
        Resource: '*',
        Condition: {
          ArnNotLike: {
            'aws:PrincipalARN': [
              'arn:aws:iam::*:role/AWSCloudFormationStackSetExecutionRole',
              `arn:aws:iam::*:role/${props.acceleratorPrefix}*`,
            ],
          },
        },
      },
    ],
  });
}
