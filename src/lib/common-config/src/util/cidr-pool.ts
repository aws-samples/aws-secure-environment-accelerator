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

import { DynamoDB } from './dynamodb';
import { AssignedVpcCidrPool, AssignedSubnetCidrPool } from '@aws-accelerator/common-outputs/src/cidr-pools';

export async function loadAssignedVpcCidrPool(tableName: string, client?: DynamoDB) {
  if (!client) {
    client = new DynamoDB();
  }
  const assignedVpcCidrPools = await client.scan({
    TableName: tableName,
  });
  return (assignedVpcCidrPools as unknown) as AssignedVpcCidrPool[];
}

export async function loadAssignedSubnetCidrPool(tableName: string, client?: DynamoDB) {
  if (!client) {
    client = new DynamoDB();
  }
  const assignedSubnetCidrPools = await client.scan({
    TableName: tableName,
  });
  return (assignedSubnetCidrPools as unknown) as AssignedSubnetCidrPool[];
}
