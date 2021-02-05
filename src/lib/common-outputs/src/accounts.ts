export const LANDING_ZONE_ACCOUNT_TYPES = ['primary', 'security', 'log-archive', 'shared-services'] as const;

export type LandingZoneAccountType = typeof LANDING_ZONE_ACCOUNT_TYPES[number];

export interface Account {
  key: string;
  id: string;
  arn: string;
  name: string;
  ou: string;
  email: string;
  type?: LandingZoneAccountType;
  ouPath?: string;
  inScope?: boolean;
}

export function getAccountId(accounts: Account[], accountKey: string): string | undefined {
  const account = accounts.find(a => a.key === accountKey);
  if (!account) {
    console.warn(`Cannot find account with key "${accountKey}"`);
    return;
  }
  return account.id;
}

export function getAccountArn(accounts: Account[], accountKey: string): string | undefined {
  const account = accounts.find(a => a.arn === accountKey);
  if (!account) {
    console.warn(`Cannot find account with key "${accountKey}"`);
    return;
  }
  return account.id;
}
