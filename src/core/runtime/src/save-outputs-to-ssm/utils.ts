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

import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { getItemInput, getUpdateItemInput, getUpdateValueInput } from '../utils/dynamodb-requests';

export interface SaveOutputsInput {
  acceleratorPrefix: string;
  outputsTableName: string;
  dynamodb: DynamoDB;
  config: AcceleratorConfig;
  account: Account;
  // ssm: SSM;
  assumeRoleName: string;
  region: string;
  outputUtilsTableName: string;
  accounts?: Account[];
}

export interface OutputUtilGenericType {
  name: string;
  index: number;
  parameters?: string[];
}

export async function getOutput(tableName: string, key: string, dynamodb: DynamoDB): Promise<StackOutput[]> {
  const outputs: StackOutput[] = [];
  const cfnOutputs = await dynamodb.getOutputValue(tableName, key);
  if (!cfnOutputs || !cfnOutputs.S) {
    return outputs;
  }
  outputs.push(...JSON.parse(cfnOutputs.S));
  return outputs;
}

export async function getIndexOutput(tableName: string, key: string, dynamodb: DynamoDB) {
  const outputUtils = await dynamodb.getOutputValue(tableName, key, 'value');
  if (!outputUtils || !outputUtils.S) {
    return;
  }
  return JSON.parse(outputUtils.S);
}

export async function getIamSsmOutput(tableName: string, key: string, dynamodb: DynamoDB): Promise<string | undefined> {
  const cfnOutputs = await dynamodb.getItem(getItemInput(tableName, key));
  if (!cfnOutputs.Item) {
    return;
  }
  return cfnOutputs.Item.value.S!;
}

export async function saveIndexOutput(
  tableName: string,
  key: string,
  value: string,
  dynamodb: DynamoDB,
): Promise<void> {
  const updateExpression = getUpdateValueInput([
    {
      key: 'v',
      name: 'value',
      type: 'S',
      value,
    },
  ]);
  await dynamodb.updateItem({
    TableName: tableName,
    Key: {
      id: { S: key },
    },
    ...updateExpression,
  });
}
