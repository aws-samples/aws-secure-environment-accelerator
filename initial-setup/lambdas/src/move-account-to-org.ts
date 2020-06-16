import { CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/types/account';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { ConfigurationOrganizationalUnit, ConfigurationAccount } from './load-configuration-step';

export interface MoveAccountInput {
  account: ConfigurationAccount;
  accountId: string;
  organizationalUnits: ConfigurationOrganizationalUnit[];
}

const org = new Organizations();

export const handler = async (input: MoveAccountInput): Promise<ConfigurationAccount> => {
  console.log(`Moving account to respective Organization...`);
  console.log(JSON.stringify(input, null, 2));
  const { account, accountId, organizationalUnits } = input;
  const rootOrg = await org.listRoots();
  const parentOrgId = rootOrg[0].Id;
  const destOrgId = organizationalUnits.find(ou => ou.ouName === account.organizationalUnit);
  await org.moveAccount({
    AccountId: accountId,
    DestinationParentId: destOrgId?.ouId!,
    SourceParentId: parentOrgId!,
  });
  account.accountId = accountId;
  return account;
};
