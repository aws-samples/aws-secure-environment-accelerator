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
