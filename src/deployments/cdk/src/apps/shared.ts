import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { Account } from '../utils/accounts';
import { Limiter } from '../utils/limits';
import { Context } from '../utils/context';
import { AccountStacks } from '../common/account-stacks';

export type PhaseDeploy = (input: PhaseInput) => Promise<void>;

export interface PhaseInput {
  acceleratorConfig: AcceleratorConfig;
  accountStacks: AccountStacks;
  accounts: Account[];
  context: Context;
  outputs: StackOutput[];
  limiter: Limiter;
}
