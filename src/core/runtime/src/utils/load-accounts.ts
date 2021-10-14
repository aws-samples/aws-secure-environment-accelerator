import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { S3 } from '@aws-accelerator/common/src/aws/s3';

const s3 = new S3();

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

export async function loadAccountsWithS3Attempt(
  tableName: string,
  client: DynamoDB,
  s3BucketName?: string,
  s3KeyName?: string,
): Promise<Account[]> {
  if (s3BucketName && s3KeyName) {
    try {
      console.log(`Loading account details from S3 working bucket.`);
      const s3GetResponseString = await s3.getObjectBodyAsString({
        Bucket: s3BucketName,
        Key: s3KeyName,
      });

      return JSON.parse(s3GetResponseString);
    } catch (e) {
      console.log(`Unable to load configuration file "${s3KeyName}" from S3\n${e.message} code:${e.code}`);
    }
  }

  console.log(`Loading account details from dynamodb.`);
  return loadAccounts(tableName, client);
}
