import * as fs from 'fs';
import * as path from 'path';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { tryGetQuotaByAccountAndLimit, LimitOutput, Limit } from '@aws-pbmm/common-outputs/lib/limits';

export async function loadLimits(): Promise<LimitOutput[]> {
  if (process.env.CONFIG_MODE === 'development') {
    const limitsPath = path.join(__dirname, '..', '..', 'limits.json');
    if (!fs.existsSync(limitsPath)) {
      throw new Error(`Cannot find local limits.json at "${limitsPath}"`);
    }
    const contents = fs.readFileSync(limitsPath);
    return JSON.parse(contents.toString());
  }

  const secretId = process.env.LIMITS_SECRET_ID;
  if (!secretId) {
    throw new Error(`The environment variable "LIMITS_SECRET_ID" needs to be set`);
  }
  const secrets = new SecretsManager();
  const secret = await secrets.getSecret(secretId);
  if (!secret) {
    throw new Error(`Cannot find secret with ID "${secretId}"`);
  }
  return JSON.parse(secret.SecretString!);
}

export class Limiter {
  readonly limits: LimitOutput[];
  readonly counts: { [index: string]: number } = {};

  constructor(limits: LimitOutput[]) {
    this.limits = limits;
  }

  create(accountKey: string, limit: Limit, additionalIndex?: string): boolean {
    const quota = tryGetQuotaByAccountAndLimit(this.limits, accountKey, limit);
    if (!quota) {
      return true;
    }
    const index = `${accountKey}/${limit}/${additionalIndex}`;
    const count = this.counts[index] ?? 0;
    if (count < quota) {
      this.counts[index] = count + 1;
      return true;
    }
    return false;
  }
}
