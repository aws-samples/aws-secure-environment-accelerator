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
}

export interface OutputUtilGenericType {
  name: string;
  index: number;
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
      value: value,
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
