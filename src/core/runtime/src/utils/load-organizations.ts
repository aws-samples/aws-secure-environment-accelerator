import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { OrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';

export async function loadOrganizations(tableName: string, client: DynamoDB): Promise<OrganizationalUnit[]> {
  const itemInput = {
    TableName: tableName,
    Key: { id: { S: `organizations` } },
  };
  const organizationsResponse = await client.getItem(itemInput);
  if (!organizationsResponse.Item) {
    throw new Error(`No organizations found in DynamoDB "${tableName}"`);
  }
  return JSON.parse(organizationsResponse.Item.value.S!);
}
