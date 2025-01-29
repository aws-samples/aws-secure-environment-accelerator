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

import { DynamoDB } from '../aws/dynamodb';
import { Account } from '../outputs/accounts';
import { STS } from '../aws/sts';


export interface Environment {
    accountId: string;
    accountKey: string;
    region: string;
}

export async function loadAccounts(tableName: string, client: DynamoDB): Promise<Account[]> {
  let index = 0;
  const accounts: Account[] = [];
  while (true) {
    const itemsInput = {
      TableName: tableName,
      Key: { id: { S: `accounts/${index}` } },
    };
    const item = await client.getItem(itemsInput);
    if (!item.Item) {
      break;
    }
    accounts.push(...JSON.parse(item.Item.value.S!));
    index++;
  }
  return accounts;
}

export function getEnvironments(accounts: Account[], regions: string[]): Environment[] {
  const environments: Environment[] = [];
  for (const account of accounts) {
    for (const region of regions) {
      environments.push({
        accountId: account.id,
        accountKey: account.key,
        region,
      });
    }
  }
  return environments;
}

export async function assumeRole(accountId: string, roleName: string) {
  const sts = new STS();
    return sts.getCredentialsForAccountAndRole(accountId, roleName);
  }