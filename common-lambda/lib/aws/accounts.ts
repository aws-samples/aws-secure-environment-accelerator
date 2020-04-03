export interface Account {
  id: string;
  arn: string;
  name: string;
  email: string;
}

export interface Accounts {
  security: Account;
  logArchive: Account;
  sharedServices: Account;
  sharedNetwork: Account;
}
