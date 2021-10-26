/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { ConfigurationOrganizationalUnit, ConfigurationAccount } from '../load-configuration-step';

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
  let destOrg = organizationalUnits.find(ou => ou.ouPath === account.ouPath);
  if (!destOrg) {
    destOrg = organizationalUnits.find(ou => ou.ouName === account.organizationalUnit);
  }
  if (!account.accountId) {
    console.warn(`Did not find Account Id in Verify Account Output for account "${account.accountName}"`);
    return account;
  }
  await org.moveAccount({
    AccountId: account.accountId,
    DestinationParentId: destOrg?.ouId!,
    SourceParentId: parentOrgId!,
  });
  return account;
};
