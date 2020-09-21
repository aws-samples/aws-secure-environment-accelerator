import { StackOutput } from "@aws-accelerator/common-outputs/src/stack-output"
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';

export async function getOutput(tableName: string, key: string, dynamodb: DynamoDB): Promise<StackOutput[]> {
  const outputs: StackOutput[] = [];
  const cfnOutputs = await dynamodb.getOutputValue(tableName, key);
  if (!cfnOutputs || !cfnOutputs.S) {
    return outputs;
  }
  outputs.push(...JSON.parse(cfnOutputs.S));
  return outputs;
}