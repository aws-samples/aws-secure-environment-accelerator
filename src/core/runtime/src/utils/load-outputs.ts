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
    const cVal = JSON.parse(item.outputValue.S!);
    outputs.push(...cVal);
  }
  return outputs;
}
