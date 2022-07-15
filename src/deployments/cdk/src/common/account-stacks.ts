/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import path from 'path';
import tempy from 'tempy';
import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { Context } from '../utils/context';
import { Account, getAccountId } from '../utils/accounts';

export interface AccountStackProps extends Omit<AcceleratorStackProps, 'env'> {
  accountId: string;
  accountKey: string;
  region: string;
  suffix?: string;
  inScope?: boolean;
}

/**
 * Auxiliary class that extends AcceleratorStack and knows about the account ID and account key.
 */
export class AccountStack extends AcceleratorStack {
  readonly accountId: string;
  readonly accountKey: string;
  readonly suffix?: string;
  readonly inScope?: boolean;

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
    this.suffix = props.suffix;
    this.inScope = props.inScope;
  }
}

export interface AccountAppProps {
  outDir?: string;
  stackProps: AccountStackProps;
}

export class AccountApp extends cdk.Stage {
  readonly stack: AccountStack;

  constructor(stackLogicalId: string, props: AccountAppProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  get suffix() {
    return this.stack.suffix;
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
  tryGetOrCreateAccountStack(
    accountKey: string,
    region?: string,
    suffix?: string,
    inScope?: boolean,
  ): AccountStack | undefined {
    const regionOrDefault = region ?? this.props.context.defaultRegion;
    const existingApp = !suffix
      ? this.apps.find(s => s.accountKey === accountKey && s.stack.region === regionOrDefault)
      : this.apps.find(s => s.accountKey === accountKey && s.stack.region === regionOrDefault && s.suffix === suffix);
    if (existingApp) {
      return existingApp.stack;
    }

    const accountId = getAccountId(this.props.accounts, accountKey);
    const operationsAccountId = getAccountId(this.props.accounts, this.props.context.centralOperationsAccount!);
    const masterAccountId = getAccountId(this.props.accounts, this.props.context.masterAccount!);
    if (!accountId || !operationsAccountId || !masterAccountId) {
      return undefined;
    }

    const stackName = this.createStackName(accountKey, regionOrDefault, suffix);
    const stackLogicalId = this.createStackLogicalId(accountKey, regionOrDefault, suffix);
    const terminationProtection = process.env.CONFIG_MODE === 'development' ? false : true;
    const acceleratorPrefix = this.props.context.acceleratorPrefix;
    const outDir = this.props.useTempOutputDir ? tempy.directory() : undefined;
    let synthesizer: cdk.DefaultStackSynthesizer;
    if (regionOrDefault === this.props.context.defaultRegion && accountId === masterAccountId) {
      synthesizer = new cdk.DefaultStackSynthesizer({
        generateBootstrapVersionRule: false,
      });
    } else {
      // Passing DefaultStackSynthesizer object to pass "Central-Operations" account S3 bucket,
      // Can be removed once we get support for bucketPrefix and Qualifier from bootstrap stack
      synthesizer = new cdk.DefaultStackSynthesizer({
        bucketPrefix: `${accountId}/`,
        qualifier: acceleratorPrefix.endsWith('-')
          ? acceleratorPrefix.slice(0, -1).toLowerCase()
          : acceleratorPrefix.toLowerCase(),
        cloudFormationExecutionRole: `arn:aws:iam::${accountId}:role/${this.props.context.acceleratorExecutionRoleName}`,
        deployRoleArn: `arn:aws:iam::${accountId}:role/${this.props.context.acceleratorExecutionRoleName}`,
        fileAssetPublishingRoleArn: `arn:aws:iam::${accountId}:role/${this.props.context.acceleratorExecutionRoleName}`,
        imageAssetPublishingRoleArn: `arn:aws:iam::${accountId}:role/${this.props.context.acceleratorExecutionRoleName}`,
        fileAssetsBucketName: `cdk-${
          acceleratorPrefix.endsWith('-')
            ? acceleratorPrefix.slice(0, -1).toLowerCase()
            : acceleratorPrefix.toLowerCase()
        }-assets-${operationsAccountId}-${regionOrDefault}`,
        generateBootstrapVersionRule: false,
      });
    }

    const app = new AccountApp(stackLogicalId, {
      outDir,
      stackProps: {
        accountId,
        accountKey,
        stackName,
        acceleratorName: this.props.context.acceleratorName,
        acceleratorPrefix,
        terminationProtection,
        region: regionOrDefault,
        suffix,
        inScope,
        synthesizer,
      },
    });
    this.apps.push(app);
    return app.stack;
  }

  protected createStackName(accountKey: string, region: string, suffix?: string) {
    // BE CAREFUL CHANGING THE STACK NAME
    // When changed, it will create a new stack and delete the old one!
    const accountPrettyName = pascalCase(accountKey).replace('_', '');
    const suffixPretty = suffix ? pascalCase(suffix).replace('_', '') : '';
    return !suffix
      ? `${this.props.context.acceleratorPrefix}${accountPrettyName}-Phase${this.props.phase}`
      : `${this.props.context.acceleratorPrefix}${accountPrettyName}-Phase${this.props.phase}-${suffixPretty}`;
  }

  protected createStackLogicalId(accountKey: string, region: string, suffix?: string) {
    // BE CAREFUL CHANGING THE STACK LOGICAL ID
    // When changed, it will generate new logical IDs for all resources in this stack and recreate all resources!
    let accountPrettyName = pascalCase(accountKey);
    if (this.startsWithNum(accountPrettyName)) {
      accountPrettyName = `a${accountPrettyName}`;
    }
    const suffixPretty = suffix ? pascalCase(suffix) : '';
    const regionPrettyName = region === this.props.context.defaultRegion ? '' : pascalCase(region);
    const stackConstructId = !suffix
      ? `${accountPrettyName}Phase${this.props.phase}${regionPrettyName}`
      : `${accountPrettyName}Phase${this.props.phase}${regionPrettyName}${suffixPretty}`;
    return stackConstructId;
  }

  startsWithNum = (expression: string) => {
    return new RegExp(/^\d/).test(expression);
  };
}
