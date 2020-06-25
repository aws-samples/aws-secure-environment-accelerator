import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';

interface VerifyAccountOrganizationInput {
  requestId: string;
}

interface VerifyAccountOrganizationOutput {
  status: string;
  accountId?: string;
}

const org = new Organizations();
export const handler = async (input: VerifyAccountOrganizationInput): Promise<VerifyAccountOrganizationOutput> => {
  console.log("Verifying Account Creation status ....");
  console.log(JSON.stringify(input, null, 2));
  const { requestId } = input;
  const accountStatus = await org.createAccountStatus(requestId);
  const accountId = accountStatus?.AccountId;
  const status = accountStatus?.State
  return {
    status: status!,
    accountId
  }
}