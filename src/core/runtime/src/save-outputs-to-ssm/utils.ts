import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export interface SaveOutputsInput {
  acceleratorPrefix: string;
  outputsTableName: string;
  dynamodb: DynamoDB;
  config: AcceleratorConfig;
  account: Account;
  ssm: SSM;
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

export async function getOutputUtil(tableName: string, key: string, dynamodb: DynamoDB) {
  const outputUtils = await dynamodb.getOutputValue(tableName, key);
  if (!outputUtils || !outputUtils.S) {
    return;
  }
  return JSON.parse(outputUtils.S);
}
