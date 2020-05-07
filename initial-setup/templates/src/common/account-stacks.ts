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

export class AccountStacks {
  readonly app: cdk.App;
  readonly props: AccountStacksProps;
  readonly stacks: { [accountKey: string]: AcceleratorStack } = {};

  constructor(app: cdk.App, props: AccountStacksProps) {
    this.app = app;
    this.props = props;
  }

  getOrCreateAccountStack(accountKey: string): AcceleratorStack {
    if (this.stacks[accountKey]) {
      return this.stacks[accountKey];
    }
    const accountId = getAccountId(this.props.accounts, accountKey);
    const accountPrettyName = pascalCase(accountKey);
    const stack = new AcceleratorStack(this.app, `${accountPrettyName}Phase${this.props.phase}`, {
      env: {
        account: accountId,
      },
      stackName: `${this.props.context.acceleratorPrefix}${accountPrettyName}-Phase${this.props.phase}`,
      acceleratorName: this.props.context.acceleratorName,
      acceleratorPrefix: this.props.context.acceleratorPrefix,
    });
    this.stacks[accountKey] = stack;
    return stack;
  }
}
