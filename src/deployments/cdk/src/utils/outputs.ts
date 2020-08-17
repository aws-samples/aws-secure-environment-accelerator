import * as fs from 'fs';
import * as path from 'path';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { S3 } from '@aws-accelerator/common/src/aws/s3';

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

  const outputBucketName = process.env.STACK_OUTPUT_BUCKET_NAME;
  const outputBucketKey = process.env.STACK_OUTPUT_BUCKET_KEY;
  const outputVersion = process.env.STACK_OUTPUT_VERSION;
  if (!outputBucketName || !outputBucketKey || !outputVersion) {
    console.warn(
      `The environment variable "STACK_OUTPUT_BUCKET_NAME", "STACK_OUTPUT_BUCKET_KEY", "STACK_OUTPUT_VERSION" need to be set`,
    );
    return [];
  }

  const outputsJson = await s3.getObjectBodyAsString({
    Bucket: outputBucketName,
    Key: outputBucketKey,
    VersionId: outputVersion,
  });
  if (!outputsJson) {
    console.warn(`Cannot find outputs "s3://${outputBucketName}${outputBucketKey}"`);
    return [];
  }
  try {
    return JSON.parse(outputsJson);
  } catch (e) {
    console.warn(`Cannot parse outputs "s3://${outputBucketName}${outputBucketKey}"`);
    return [];
  }
}
