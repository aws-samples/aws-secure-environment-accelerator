import * as aws from 'aws-sdk';
import { Organizations } from './organizations';

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

/**
 * Find the account with the given name in the accounts array or throw an error if the account does not exist.
 */
function accountByName(accounts: aws.Organizations.Account[], name: string): Account {
  const account = accounts.find((a) => a.Name === name);
  if (account) {
    return {
      id: account.Id!!,
      arn: account.Arn!!,
      name: account.Name!!,
      email: account.Email!!,
    };
  }
  throw new Error(`Cannot find account with name "${name}"`);
}

export async function getOrganizationAccounts(): Promise<Accounts> {
  // The first step is to load all the execution roles
  const organizations = new Organizations();
  const organizationAccounts = await organizations.listAccounts();

  // Find all relevant accounts in the organization
  return {
    security: accountByName(organizationAccounts, 'security'),
    logArchive: accountByName(organizationAccounts, 'log-archive'),
    sharedServices: accountByName(organizationAccounts, 'shared-services'),
    sharedNetwork: accountByName(organizationAccounts, 'shared-network'),
    // TODO Load more accounts here
  };
}
