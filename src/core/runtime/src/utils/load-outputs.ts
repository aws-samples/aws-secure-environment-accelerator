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
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export async function loadOutputs(tableName: string, client: DynamoDB): Promise<StackOutput[]> {
  const outputs: StackOutput[] = [];
  const outputsResponse = await client.scan({
    TableName: tableName,
  });
  if (!outputsResponse) {
    console.warn(`Did not find outputs in DynamoDB table "${tableName}"`);
    return [];
  }
  for (const item of outputsResponse) {
    const cVal = JSON.parse(item.outputValue as string);
    outputs.push(...cVal);
  }
  return outputs;
}
