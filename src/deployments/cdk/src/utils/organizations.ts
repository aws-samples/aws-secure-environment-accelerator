import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import * as fs from 'fs';
import * as path from 'path';
import { OrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';

export async function loadOrganizations(): Promise<OrganizationalUnit[]> {
  if (process.env.CONFIG_MODE === 'development') {
    const organizationsPath = path.join(__dirname, '..', '..', 'organizations.json');
    if (!fs.existsSync(organizationsPath)) {
      throw new Error(`Cannot find local organizations.json at "${organizationsPath}"`);
    }
    const contents = fs.readFileSync(organizationsPath);
    return JSON.parse(contents.toString());
  }

  const secretId = process.env.ORGANIZATIONS_SECRET_ID;
  if (!secretId) {
    throw new Error(`The environment variable "ORGANIZATIONS_SECRET_ID" needs to be set`);
  }
  const secrets = new SecretsManager();
  const secret = await secrets.getSecret(secretId);
  if (!secret) {
    throw new Error(`Cannot find secret with ID "${secretId}"`);
  }
  return JSON.parse(secret.SecretString!);
}
