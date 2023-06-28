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

import { DynamoDB } from '../aws/dynamodb';

export interface StackOutput {
  accountKey: string;
  region: string;
  outputKey?: string;
  outputValue?: string;
  outputDescription?: string;
  outputExportName?: string;
}

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

export function parseValueFromOutput(output: StackOutput) {
  try {
    if (output.outputValue && output.outputValue.startsWith('{')) {
      return {
        ...output,
        ...JSON.parse(output.outputValue),
      };
    }
  } catch (e) {
    console.warn(`Unable to parse output: ${e}`);
  }
}

export interface StackOutputValueFindProps{
  outputs: StackOutput[];
  accountKey?: string;
  region?: string;
  predicate?: (value: {[key: string]: any}) => boolean;
}

export function findValuesFromOutputs(props: StackOutputValueFindProps): {[key: string]: any}[] {
  const values = props.outputs
    .filter(output => props.accountKey === undefined || output.accountKey === props.accountKey)
    .filter(output => props.region === undefined || output.region === props.region)
    .map(output => parseValueFromOutput(output))
    .filter((structured) => !!structured);
  if (props.predicate) {
    return values.filter(props.predicate);
  }
  return values;
}
