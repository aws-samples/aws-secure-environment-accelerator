import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import * as fs from 'fs';
import * as path from 'path';

export interface StackOutput {
  accountKey: string;
  outputKey?: string;
  outputValue?: string;
  outputDescription?: string;
  outputExportName?: string;
}

export type StackOutputs = StackOutput[];

export function getStackOutput(outputs: StackOutputs, accountKey: string, outputKey: string): string {
  const output = outputs.find(o => o.outputKey === outputKey && o.accountKey === accountKey);
  if (!output) {
    throw new Error(`Cannot find output with key "${outputKey}" in account with key "${accountKey}"`);
  }
  return output.outputValue!;
}

export async function loadStackOutputs(): Promise<StackOutputs> {
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
    throw new Error(`Cannot find secret with ID "${secretId}"`);
  }
  return JSON.parse(secret.SecretString!);
}
