import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export async function loadAccounts(tableName: string, client: DynamoDB): Promise<Account[]> {
  let index = 0;
  const accounts: Account[] = [];
  while (true) {
    const itemsInput = {
      TableName: tableName,
      Key: { id: { S: `accounts/${index}` } },
    };
    const item = await new DynamoDB().getItem(itemsInput);
    if (index === 0 && !item.Item) {
      throw new Error(`Cannot find parameter with ID "accounts"`);
    }

    if (!item.Item) {
      break;
    }
    accounts.push(...JSON.parse(item.Item.value.S!));
    index++;
  }
  return accounts;
}
