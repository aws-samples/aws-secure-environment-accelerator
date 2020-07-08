import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { CreateAccountStatus } from 'aws-sdk/clients/organizations';

interface VerifyAccountOrganizationInput {
  requestId: string;
}

const org = new Organizations();
export const handler = async (input: VerifyAccountOrganizationInput): Promise<CreateAccountStatus | undefined> => {
  console.log('Verifying Account Creation status ....');
  console.log(JSON.stringify(input, null, 2));
  const { requestId } = input;
  const accountStatus = await org.createAccountStatus(requestId);
  return accountStatus;
};
