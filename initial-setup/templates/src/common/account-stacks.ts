import path from 'path';
import tempy from 'tempy';
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

  constructor(readonly app: cdk.Stage, id: string, props: AccountStackProps) {
    super(app, id, {
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

export interface AccountAppProps {
  outDir?: string;
  stackProps: AccountStackProps;
}

export class AccountApp extends cdk.Stage {
  readonly stack: AccountStack;

  constructor(stackLogicalId: string, props: AccountAppProps) {
    // tslint:disable-next-line:no-any
    super(undefined as any, '', {
      outdir: props.outDir ?? path.resolve('cdk.out'),
      env: {
        account: props.stackProps.accountId,
        region: props.stackProps.region,
      },
    });
    this.stack = new AccountStack(this, stackLogicalId, props.stackProps);
  }

  get accountId() {
    return this.stack.accountId;
  }

  get accountKey() {
    return this.stack.accountKey;
  }
}

export interface AccountStacksProps {
  phase: string;
  accounts: Account[];
  context: Context;
  useTempOutputDir?: boolean;
}

/**
 * Auxiliary class that keeps track of the phase stacks for every account. Every account can only have one stack per
 * phase and this class helps managing the stacks.
 */
export class AccountStacks {
  readonly apps: AccountApp[] = [];

  constructor(private readonly props: AccountStacksProps) {}

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
    const existingApp = this.apps.find(s => s.accountKey === accountKey && s.stack.region === regionOrDefault);
    if (existingApp) {
      return existingApp.stack;
    }

    const accountId = getAccountId(this.props.accounts, accountKey);
    if (!accountId) {
      return undefined;
    }

    const stackName = this.createStackName(accountKey, regionOrDefault);
    console.log('stackName', stackName);
    const stackLogicalId = this.createStackLogicalId(accountKey, regionOrDefault);
    const terminationProtection = process.env.CONFIG_MODE === 'development' ? false : true;

    const outDir = this.props.useTempOutputDir ? tempy.directory() : undefined;
    const app = new AccountApp(stackLogicalId, {
      outDir,
      stackProps: {
        accountId,
        accountKey,
        stackName,
        acceleratorName: this.props.context.acceleratorName,
        acceleratorPrefix: this.props.context.acceleratorPrefix,
        terminationProtection,
        region: regionOrDefault,
      },
    });
    this.apps.push(app);
    return app.stack;
  }

  protected createStackName(accountKey: string, region: string) {
    // BE CAREFUL CHANGING THE STACK NAME
    // When changed, it will create a new stack and delete the old one!
    const accountPrettyName = pascalCase(accountKey);
    console.log('accountKey', 'accountPrettyName', accountKey, accountPrettyName);
    return `${this.props.context.acceleratorPrefix}${accountPrettyName}-Phase${this.props.phase}`;
  }

  protected createStackLogicalId(accountKey: string, region: string) {
    // BE CAREFUL CHANGING THE STACK LOGICAL ID
    // When changed, it will generate new logical IDs for all resources in this stack and recreate all resources!
    const accountPrettyName = pascalCase(accountKey);
    const regionPrettyName = region === this.props.context.defaultRegion ? '' : pascalCase(region);
    const stackConstructId = `${accountPrettyName}Phase${this.props.phase}${regionPrettyName}`;
    return stackConstructId;
  }
}
