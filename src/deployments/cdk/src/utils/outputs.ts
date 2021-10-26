import * as fs from 'fs';
import * as path from 'path';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';

const dynamodb = new DynamoDB();

export async function loadStackOutputs(): Promise<StackOutput[]> {
  if (process.env.CONFIG_MODE === 'development') {
    const outputsPath = path.join(__dirname, '..', '..', 'outputs.json');
    if (!fs.existsSync(outputsPath)) {
      throw new Error(`Cannot find local outputs.json at "${outputsPath}"`);
    }
    const contents = fs.readFileSync(outputsPath);
    return JSON.parse(contents.toString());
  }

  const outputTableName = process.env.STACK_OUTPUT_TABLE_NAME;
  if (!outputTableName) {
    console.warn(`The environment variable "STACK_OUTPUT_TABLE_NAME" need to be set`);
    return [];
  }

  const outputs: StackOutput[] = [];
  const outputsResponse = await dynamodb.scan({
    TableName: outputTableName,
  });
  if (!outputsResponse) {
    console.warn(`Did not find outputs in DynamoDB table "${outputTableName}"`);
    return [];
  }
  for (const item of outputsResponse) {
    const cVal = JSON.parse(item.outputValue.S!);
    outputs.push(...cVal);
  }
  return outputs;
}
