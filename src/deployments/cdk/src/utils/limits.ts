import * as fs from 'fs';
import * as path from 'path';
import { Limit, LimitOutput } from '@aws-accelerator/common-outputs/src/limits';
import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';

export { Limit, LimitOutput } from '@aws-accelerator/common-outputs/src/limits';

export type LimitOutputs = LimitOutput[];

export async function loadLimits(): Promise<LimitOutputs> {
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

export function tryGetQuotaByAccountAndLimit(
  limits: LimitOutputs,
  accountKey: string,
  limit: Limit,
): number | undefined {
  const limitOutput = limits.find(a => a.accountKey === accountKey && a.limitKey === limit);
  return limitOutput?.value;
}

export class Limiter {
  readonly limits: LimitOutputs;
  readonly counts: { [index: string]: number } = {};

  constructor(limits: LimitOutputs) {
    this.limits = limits;
  }

  create(accountKey: string, limit: Limit, suffix?: string): boolean {
    const quota = tryGetQuotaByAccountAndLimit(this.limits, accountKey, limit);
    if (!quota) {
      return true;
    }
    const index = `${accountKey}/${limit}/${suffix}`;
    const count = this.counts[index] ?? 0;
    if (count < quota) {
      this.counts[index] = count + 1;
      return true;
    }
    return false;
  }
}
