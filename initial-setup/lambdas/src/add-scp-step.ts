import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';

interface AddScpInput {
  roleName: string;
  policyNames: string[];
}

export const handler = async (input: AddScpInput) => {
  console.log(`Adding service control policy to Organization...`);
  console.log(JSON.stringify(input, null, 2));

  const { roleName, policyNames } = input;
  const status: string = '';

  return {
    status: 'SUCCESS',
    statusReason: status,
  };
};
