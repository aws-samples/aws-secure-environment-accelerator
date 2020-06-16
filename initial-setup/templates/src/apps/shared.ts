import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Account } from '../utils/accounts';
import { Limiter } from '../utils/limits';
import { Context } from '../utils/context';
import { AccountStacks } from '../common/account-stacks';
import { Organization } from '../utils/organizations';

export type PhaseDeploy = (input: PhaseInput) => Promise<void>;

export interface PhaseInput {
  acceleratorConfig: AcceleratorConfig;
  accountStacks: AccountStacks;
  accounts: Account[];
  context: Context;
  outputs: StackOutput[];
  limiter: Limiter;
  organizations: Organization[];
}
