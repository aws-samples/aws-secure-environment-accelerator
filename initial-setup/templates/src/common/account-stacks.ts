import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { Context } from '../utils/context';
import { Account, getAccountId } from '../utils/accounts';

export interface AccountStackProps extends Omit<AcceleratorStackProps, 'env'> {
  accountId: string;
  accountKey: string;
}

/**
 * Auxiliary class that extends AcceleratorStack and knows about the account ID and account key.
 */
export class AccountStack extends AcceleratorStack {
  readonly accountId: string;
  readonly accountKey: string;

  constructor(scope: cdk.Construct, id: string, props: AccountStackProps) {
    super(scope, id, {
      ...props,
      env: {
        account: props.accountId,
      },
    });

    this.accountId = props.accountId;
    this.accountKey = props.accountKey;
  }
}

export interface AccountStacksProps {
  phase: string;
  accounts: Account[];
  context: Context;
}

/**
 * Auxiliary class that keeps track of the phase stacks for every account. Every account can only have one stack per
 * phase and this class helps managing the stacks.
 */
export class AccountStacks {
  readonly app: cdk.App;
  readonly props: AccountStacksProps;
  readonly stacks: { [accountKey: string]: AccountStack } = {};

  constructor(app: cdk.App, props: AccountStacksProps) {
    this.app = app;
    this.props = props;
  }

  getOrCreateAccountStack(accountKey: string): AccountStack {
    const accountStack = this.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      throw new Error(`Cannot find account stack for account ${accountKey}`);
    }
    return accountStack;
  }

  /**
   * Get the existing stack for the given account or create a new stack if no such stack exists yet.
   */
  tryGetOrCreateAccountStack(accountKey: string): AccountStack | undefined {
    if (this.stacks[accountKey]) {
      return this.stacks[accountKey];
    }
    const accountId = getAccountId(this.props.accounts, accountKey);
    if (!accountId) {
      return undefined;
    }

    const accountPrettyName = pascalCase(accountKey);
    const terminationProtection = process.env.CONFIG_MODE === 'development' ? false : true;
    const stack = new AccountStack(this.app, `${accountPrettyName}Phase${this.props.phase}`, {
      accountId,
      accountKey,
      stackName: `${this.props.context.acceleratorPrefix}${accountPrettyName}-Phase${this.props.phase}`,
      acceleratorName: this.props.context.acceleratorName,
      acceleratorPrefix: this.props.context.acceleratorPrefix,
      terminationProtection,
    });
    this.stacks[accountKey] = stack;
    return stack;
  }
}
