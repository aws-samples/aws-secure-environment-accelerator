import { SecretsManager } from "@aws-pbmm/common-lambda/lib/aws/secrets-manager";
import { AcceleratorConfig } from "@aws-pbmm/common-lambda/lib/config";
import * as fs from 'fs';
import * as path from 'path';

export async function loadAcceleratorConfig(): Promise<AcceleratorConfig> {
  if (process.env.CONFIG_MODE === 'development') {
    const configPath = path.join(__dirname, '..', '..', 'config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Cannot find local config.json at "${configPath}"`);
    }
    const contents = fs.readFileSync(configPath);
    return AcceleratorConfig.fromBuffer(contents);
  }
  
  const secretId = process.env.CONFIG_SECRET_ID;
  if (!secretId) {
    throw new Error(`The environment variable "CONFIG_SECRET_ID" needs to be set`);
  }
  const secrets = new SecretsManager();
  const secret = await secrets.getSecret(secretId);
  if (!secret) {
    throw new Error(`Cannot find secret with ID "${secretId}"`);
  }
  return AcceleratorConfig.fromString(secret.SecretString!);
}
