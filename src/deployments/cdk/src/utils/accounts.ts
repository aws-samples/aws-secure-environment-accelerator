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
    const item = await new DynamoDB().getItem(tableName, `${accountsItemId}/${index}`);
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
