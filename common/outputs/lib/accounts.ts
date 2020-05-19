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
