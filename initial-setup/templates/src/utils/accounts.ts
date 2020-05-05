import * as fs from 'fs';
import * as path from 'path';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';

export async function loadAccounts(): Promise<Account[]> {
  if (process.env.CONFIG_MODE === 'development') {
    const accountsPath = path.join(__dirname, '..', '..', 'accounts.json');
    if (!fs.existsSync(accountsPath)) {
      throw new Error(`Cannot find local accounts.json at "${accountsPath}"`);
    }
    const contents = fs.readFileSync(accountsPath);
    return JSON.parse(contents.toString());
  }

  const secretId = process.env.ACCOUNTS_SECRET_ID;
  if (!secretId) {
    throw new Error(`The environment variable "ACCOUNTS_SECRET_ID" needs to be set`);
  }
  const secrets = new SecretsManager();
  const secret = await secrets.getSecret(secretId);
  if (!secret) {
    throw new Error(`Cannot find secret with ID "${secretId}"`);
  }
  return JSON.parse(secret.SecretString!);
}
