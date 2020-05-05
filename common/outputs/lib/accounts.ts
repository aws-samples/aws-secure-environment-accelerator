export enum LandingZoneAccountType {
  Primary = 'primary',
  Security = 'security',
  LogArchive = 'log-archive',
  SharedServices = 'shared-services',
}

export interface Account {
  key: string;
  id: string;
  arn: string;
  name: string;
  email: string;
  ou: string;
  type?: LandingZoneAccountType;
}

export class Accounts extends Array<Account> {
  constructor(accounts: Account[]) {
    super();
    // See https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, Accounts.prototype);
    // Add all accounts to this class
    this.push(...accounts);
  }

  getAccountById(accountId: string): Account {
    const account = this.tryGetAccountById(accountId);
    if (!account) {
      throw new Error(`Cannot find account with ID "${accountId}"`);
    }
    return account;
  }

  tryGetAccountById(accountId: string) {
    return this.find(a => a.id === accountId);
  }

  getAccountByKey(accountKey: string): Account {
    const account = this.tryGetAccountByKey(accountKey);
    if (!account) {
      throw new Error(`Cannot find account with key "${accountKey}"`);
    }
    return account;
  }

  tryGetAccountByKey(accountKey: string) {
    return this.find(a => a.key === accountKey);
  }

  getAccountByType(type: LandingZoneAccountType): Account {
    const account = this.tryGetAccountByType(type);
    if (!account) {
      throw new Error(`Cannot find account with type "${type}"`);
    }
    return account;
  }

  tryGetAccountByType(type: LandingZoneAccountType) {
    return this.find(a => a.type === type);
  }
}

/**
 * @deprecated
 */
export function getAccountId(accounts: Iterable<Account>, accountKey: string): string {
  for (const account of accounts) {
    if (account.key === accountKey) {
      return account.id;
    }
  }
  throw new Error(`Cannot find account with key "${accountKey}"`);
}
