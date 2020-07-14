import * as fs from 'fs';
import * as path from 'path';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';

const s3 = new S3();

export async function loadStackOutputs(): Promise<StackOutput[]> {
  if (process.env.CONFIG_MODE === 'development') {
    const outputsPath = path.join(__dirname, '..', '..', 'outputs.json');
    if (!fs.existsSync(outputsPath)) {
      throw new Error(`Cannot find local outputs.json at "${outputsPath}"`);
    }
    const contents = fs.readFileSync(outputsPath);
    return JSON.parse(contents.toString());
  }

  const bucketName = process.env.STACK_OUTPUTS_BUCKET_NAME;
  const bucketKey = process.env.STACK_OUTPUTS_BUCKET_KEY;
  if (!bucketName || !bucketKey) {
    console.warn(`The environment variable "STACK_OUTPUTS_BUCKET_NAME" and "STACK_OUTPUTS_BUCKET_KEY" need to be set`);
    return [];
  }

  const outputsJson = await s3.getObjectBodyAsString({
    Bucket: bucketName,
    Key: bucketKey,
  });
  if (!outputsJson) {
    console.warn(`Cannot find outputs "s3://${bucketName}${bucketKey}"`);
    return [];
  }
  try {
    return JSON.parse(outputsJson);
  } catch (e) {
    console.warn(`Cannot parse outputs "s3://${bucketName}${bucketKey}"`);
    return [];
  }
}
