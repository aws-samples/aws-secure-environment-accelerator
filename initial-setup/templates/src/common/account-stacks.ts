import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { Context } from '../utils/context';
import { Account, getAccountId } from '../utils/accounts';

export interface AccountStacksProps {
  phase: number;
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
  readonly stacks: { [accountKey: string]: AcceleratorStack } = {};

  constructor(app: cdk.App, props: AccountStacksProps) {
    this.app = app;
    this.props = props;
  }

  /**
   * Get the existing stack for the given account or create a new stack if no such stack exists yet.
   */
  getOrCreateAccountStack(accountKey: string): AcceleratorStack {
    if (this.stacks[accountKey]) {
      return this.stacks[accountKey];
    }
    const accountId = getAccountId(this.props.accounts, accountKey);
    const accountPrettyName = pascalCase(accountKey);
    const terminationProtection = process.env.CONFIG_MODE === 'development' ? false: true;
    const stack = new AcceleratorStack(this.app, `${accountPrettyName}Phase${this.props.phase}`, {
      env: {
        account: accountId,
      },
      stackName: `${this.props.context.acceleratorPrefix}${accountPrettyName}-Phase${this.props.phase}`,
      acceleratorName: this.props.context.acceleratorName,
      acceleratorPrefix: this.props.context.acceleratorPrefix,
      terminationProtection,
    });
    this.stacks[accountKey] = stack;
    return stack;
  }
}
