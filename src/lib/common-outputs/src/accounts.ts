export type LandingZoneAccountType = 'primary' | 'security' | 'log-archive' | 'shared-services';

export interface Account {
  key: string;
  id: string;
  arn: string;
  name: string;
  ou: string;
  email: string;
  type?: LandingZoneAccountType;
  ouPath?: string;
  isMandatory?: boolean;
  isNew?: boolean;
  inScope?: boolean;
  isDeployed?: boolean;
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
