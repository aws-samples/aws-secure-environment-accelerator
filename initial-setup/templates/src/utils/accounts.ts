import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import * as fs from 'fs';
import * as path from 'path';

export interface Account {
  key: string;
  id: string;
  arn: string;
  ou: string;
  type?: string;
}

export function getAccountId(accounts: Account[], accountKey: string): string {
  const account = accounts.find(a => a.key === accountKey);
  if (!account) {
    throw new Error(`Cannot find account with key "${accountKey}"`);
  }
  return account.id;
}

export function getAccountArn(accounts: Account[], accountKey: string): string {
  const account = accounts.find(a => a.arn === accountKey);
  if (!account) {
    throw new Error(`Cannot find account with key "${accountKey}"`);
  }
  return account.id;
}

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
