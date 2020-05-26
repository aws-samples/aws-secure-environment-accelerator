import * as cdk from '@aws-cdk/core';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Account } from '../utils/accounts';
import { Limiter } from '../utils/limits';
import { Context } from '../utils/context';
import { AccountStacks } from '../common/account-stacks';

export type Phase = (input: PhaseInput) => Promise<void>;

export interface PhaseInput {
  acceleratorConfig: AcceleratorConfig;
  accountStacks: AccountStacks;
  accounts: Account[];
  app: cdk.App;
  context: Context;
  outputs: StackOutput[];
  limiter: Limiter;
}
