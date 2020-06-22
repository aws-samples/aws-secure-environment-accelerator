import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { ConfigurationOrganizationalUnit, ConfigurationAccount } from './../load-configuration-step';

export interface MoveAccountInput {
  account: ConfigurationAccount;
  accountId: string;
  organizationalUnits: ConfigurationOrganizationalUnit[];
}

const org = new Organizations();

export const handler = async (input: MoveAccountInput): Promise<ConfigurationAccount> => {
  console.log(`Moving account to respective Organization...`);
  console.log(JSON.stringify(input, null, 2));
  const { account, organizationalUnits } = input;
  const rootOrg = await org.listRoots();
  const parentOrgId = rootOrg[0].Id;
  const destOrgId = organizationalUnits.find(ou => ou.ouName === account.organizationalUnit);
  if (!account.accountId) {
    console.warn(`Did not find Account Id in Verify Account Output for account "${account.accountName}"`);
    return account;
  }
  await org.moveAccount({
    AccountId: account.accountId,
    DestinationParentId: destOrgId?.ouId!,
    SourceParentId: parentOrgId!,
  });
  return account;
};
