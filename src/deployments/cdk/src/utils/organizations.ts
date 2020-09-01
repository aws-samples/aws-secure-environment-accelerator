import * as fs from 'fs';
import * as path from 'path';
import { OrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';

export async function loadOrganizations(): Promise<OrganizationalUnit[]> {
  if (process.env.CONFIG_MODE === 'development') {
    const organizationsPath = path.join(__dirname, '..', '..', 'organizations.json');
    if (!fs.existsSync(organizationsPath)) {
      throw new Error(`Cannot find local organizations.json at "${organizationsPath}"`);
    }
    const contents = fs.readFileSync(organizationsPath);
    return JSON.parse(contents.toString());
  }

  const tableName = process.env.DYNAMODB_PARAMETERS_TABLE_NAME;
  if (!tableName) {
    throw new Error(`The environment variable "DYNAMODB_PARAMETERS_TABLE_NAME" needs to be set`);
  }

  const organizationsItemId = process.env.ORGANIZATIONS_ITEM_ID;
  if (!organizationsItemId) {
    throw new Error(`The environment variable "ORGANIZATIONS_ITEM_ID" needs to be set`);
  }

  const organizations = await new DynamoDB().getItem(tableName, organizationsItemId);
  if (!organizations.Item) {
    throw new Error(`Cannot find value with Item ID "${organizationsItemId}"`);
  }
  return JSON.parse(organizations.Item.value.S!);
}
