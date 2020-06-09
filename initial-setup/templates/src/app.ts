import * as cdk from '@aws-cdk/core';
import { PhaseDeploy } from './apps/shared';
import { AccountStacks } from './common/account-stacks';
import { loadAccounts, getAccountId } from './utils/accounts';
import { loadAcceleratorConfig } from './utils/config';
import { loadContext } from './utils/context';
import { loadStackOutputs } from './utils/outputs';
import { loadLimits, Limiter } from './utils/limits';

export interface PhaseInfo {
  readonly runner: () => Promise<PhaseDeploy>;
  readonly name: string;
  readonly id: string;
}

// Right now there are only phases 0, 1, 2, 3, 4, 5
export const phases: PhaseInfo[] = [0, 1, 2, 3, 4, 5].map(id => ({
  runner: () => import(`./apps/phase-${id}`).then(phase => phase.deploy),
  id: `${id}`,
  name: `${id}`,
}));

export interface AppProps {
  outdir?: string;
  phase: string;
  region?: string;
  accountKey?: string;
}

export async function deploy(props: AppProps) {
  const phase = phases.find(p => p.id === props.phase);
  if (!phase) {
    throw new Error(`Cannot find phase ${props.phase}`);
  }

  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const context = loadContext();
  const limits = await loadLimits();
  const limiter = new Limiter(limits);
  const outputs = await loadStackOutputs();

  const includeRegion = props.region;
  const includeAccountKey = props.accountKey;
  let includeAccountId;
  if (includeAccountKey) {
    includeAccountId = getAccountId(accounts, includeAccountKey);
    if (!includeAccountId) {
      throw new Error(`Cannot find account ${includeAccountKey}`);
    }
  }

  const app = new cdk.App({
    outdir: props.outdir,
  });

  const accountStacks = new AccountStacks(app, {
    phase: phase.name,
    accounts,
    context,
  });

  const runner = await phase.runner();
  await runner({
    acceleratorConfig,
    accountStacks,
    accounts,
    app,
    context,
    limiter,
    outputs,
  });

  // Only deploy stacks for the given account
  for (const child of app.node.children) {
    if (!(child instanceof cdk.Stack)) {
      continue;
    }

    const stackAccountId = child.account;
    // If the stack is not for the given account, then we remove it from the app
    if (includeAccountId && includeAccountId !== stackAccountId) {
      console.info(`Skipping deployment of stack ${child.stackName}`);
      // Remove the stack from the app
      app.node.tryRemoveChild(child.node.id);
    }

    const stackRegion = child.region;
    // If the stack is not for the given region, then we remove it from the app
    if (includeRegion && includeRegion !== stackRegion) {
      console.info(`Skipping deployment of stack ${child.stackName}`);
      // Remove the stack from the app
      app.node.tryRemoveChild(child.node.id);
    }
  }

  return app;
}
