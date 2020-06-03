import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { Context } from '../utils/context';
import { Account, getAccountId } from '../utils/accounts';

export interface AccountStackProps extends Omit<AcceleratorStackProps, 'env'> {
  accountId: string;
  accountKey: string;
  region: string;
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
        region: props.region,
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
  readonly stacks: AccountStack[] = [];

  constructor(private readonly app: cdk.App, private readonly props: AccountStacksProps) {}

  getOrCreateAccountStack(accountKey: string, region?: string): AccountStack {
    const accountStack = this.tryGetOrCreateAccountStack(accountKey, region);
    if (!accountStack) {
      throw new Error(`Cannot find account stack for account ${accountKey}`);
    }
    return accountStack;
  }

  /**
   * Get the existing stack for the given account or create a new stack if no such stack exists yet.
   */
  tryGetOrCreateAccountStack(accountKey: string, region?: string): AccountStack | undefined {
    const regionOrDefault = region ?? this.props.context.defaultRegion;
    const existingStack = this.stacks.find(s => s.accountKey === accountKey && s.region === regionOrDefault);
    if (existingStack) {
      return existingStack;
    }

    const accountId = getAccountId(this.props.accounts, accountKey);
    if (!accountId) {
      return undefined;
    }

    const accountPrettyName = pascalCase(accountKey);
    const stackName = `${this.props.context.acceleratorPrefix}${accountPrettyName}-Phase${this.props.phase}`;
    // BE CAREFUL CHANGING THE STACK CONSTRUCT ID
    // When changed, it will create a new stack and delete the old one
    const stackConstructId = `${accountPrettyName}Phase${this.props.phase}${region ?? ''}`;
    const terminationProtection = process.env.CONFIG_MODE === 'development' ? false : true;
    const stack = new AccountStack(this.app, stackConstructId, {
      accountId,
      accountKey,
      stackName,
      acceleratorName: this.props.context.acceleratorName,
      acceleratorPrefix: this.props.context.acceleratorPrefix,
      terminationProtection,
      region: regionOrDefault,
    });
    this.stacks.push(stack);
    return stack;
  }
}
