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

import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import * as fs from 'fs';
import * as path from 'path';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';

export { Account, getAccountId, getAccountArn } from '@aws-accelerator/common-outputs/src/accounts';

export async function loadAccounts(): Promise<Account[]> {
  if (process.env.CONFIG_MODE === 'development') {
    const accountsPath = path.join(__dirname, '..', '..', 'accounts.json');
    if (!fs.existsSync(accountsPath)) {
      throw new Error(`Cannot find local accounts.json at "${accountsPath}"`);
    }
    const contents = fs.readFileSync(accountsPath);
    return JSON.parse(contents.toString());
  }

  const tableName = process.env.DYNAMODB_PARAMETERS_TABLE_NAME;
  if (!tableName) {
    throw new Error(`The environment variable "DYNAMODB_PARAMETERS_TABLE_NAME" needs to be set`);
  }

  const accountsItemId = process.env.ACCOUNTS_ITEM_ID;
  if (!accountsItemId) {
    throw new Error(`The environment variable "ACCOUNTS_ITEM_ID" needs to be set`);
  }

  let index = 0;
  const accounts: Account[] = [];
  while (true) {
    const itemsInput = {
      TableName: tableName,
      Key: { id: { S: `${accountsItemId}/${index}` } },
    };
    const item = await new DynamoDB().getItem(itemsInput);
    if (index === 0 && !item.Item) {
      throw new Error(`Cannot find parameter with ID "${accountsItemId}"`);
    }

    if (!item.Item) {
      break;
    }
    accounts.push(...JSON.parse(item.Item.value.S!));
    index++;
  }
  return accounts;
}
