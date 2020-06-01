import * as fs from 'fs';
import * as path from 'path';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

export async function loadStackOutputs(): Promise<StackOutput[]> {
  if (process.env.CONFIG_MODE === 'development') {
    const outputsPath = path.join(__dirname, '..', '..', 'outputs.json');
    if (!fs.existsSync(outputsPath)) {
      throw new Error(`Cannot find local outputs.json at "${outputsPath}"`);
    }
    const contents = fs.readFileSync(outputsPath);
    return JSON.parse(contents.toString());
  }

  const secretId = process.env.STACK_OUTPUT_SECRET_ID;
  if (!secretId) {
    throw new Error(`The environment variable "STACK_OUTPUT_SECRET_ID" needs to be set`);
  }
  const secrets = new SecretsManager();
  const secret = await secrets.getSecret(secretId);
  if (!secret) {
    console.warn(`Cannot find output secret with ID "${secretId}"`);
    return [];
  }
  try {
    return JSON.parse(secret.SecretString!);
  } catch (e) {
    console.warn(`Cannot parse output secret with ID "${secretId}"`);
    return [];
  }
}
