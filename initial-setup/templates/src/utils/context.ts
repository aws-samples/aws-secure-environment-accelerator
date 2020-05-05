import { loadAccounts } from './accounts';
import { loadAcceleratorConfig } from './config';
import { loadEnvironment, Environment } from './environment';
import { loadStackOutputs } from './outputs';
import { loadLimits, Limiter } from './limits';
import { LimitOutput } from '@aws-pbmm/common-outputs/lib/limits';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Account, Accounts } from '@aws-pbmm/common-outputs/lib/accounts';
import { StackOutput, StackOutputs } from '@aws-pbmm/common-outputs/lib/outputs';

export interface ContextProps {
  environment: Environment;
  config: AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
  limits: LimitOutput[];
}

export class Context {
  readonly environment: Environment;
  readonly config: AcceleratorConfig;
  readonly accounts: Accounts;
  readonly outputs: StackOutputs;
  readonly limiter: Limiter;

  constructor(props: ContextProps) {
    this.environment = props.environment;
    this.config = props.config;
    this.accounts = new Accounts(props.accounts);
    this.outputs = new StackOutputs(props.outputs);
    this.limiter = new Limiter(props.limits);
  }

  static async load() {
    const environment = loadEnvironment();
    const config = await loadAcceleratorConfig();
    const accounts = await loadAccounts();
    const outputs = await loadStackOutputs();
    const limits = await loadLimits();

    return new Context({
      environment,
      config,
      accounts,
      outputs,
      limits,
    });
  }
}
