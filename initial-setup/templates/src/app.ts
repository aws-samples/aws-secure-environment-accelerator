import * as cdk from '@aws-cdk/core';
import { PhaseDeploy } from './apps/shared';
import { AccountStacks } from './common/account-stacks';
import { loadAccounts, getAccountId } from './utils/accounts';
import { loadAcceleratorConfig } from './utils/config';
import { loadContext } from './utils/context';
import { loadStackOutputs } from './utils/outputs';
import { loadLimits, Limiter } from './utils/limits';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

const ACCELERATOR_PHASE = process.env.ACCELERATOR_PHASE!;

interface PhaseInfo {
  runner: () => Promise<PhaseDeploy>;
  name: string;
  id: string;
}

// Right now there are only phases 0, 1, 2, 3, 4, 5
const phases: PhaseInfo[] = [0, 1, 2, 3, 4, 5].map(id => ({
  runner: () => import(`./apps/phase-${id}`).then(phase => phase.deploy),
  id: `${id}`,
  name: `${id}`,
}));

/**
 * This is the main entry point to deploy phase 0.
 *
 * The following resources are deployed in phase 0:
 *   - Log archive bucket
 *   - Copy of the central bucket
 */
async function main() {
  const phase = phases.find(p => p.id === ACCELERATOR_PHASE);
  if (!phase) {
    throw new Error(`Cannot find phase ${ACCELERATOR_PHASE}`);
  }

  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const context = loadContext();
  const limits = await loadLimits();
  const limiter = new Limiter(limits);
  const outputs = await loadStackOutputs();

  // If ACCELERATOR_ACCOUNT_KEY is set then we only deploy the stacks for those accounts
  // TODO Do the same for region
  const includeAccountKey = process.env.ACCELERATOR_ACCOUNT_KEY;
  let includeAccountId;
  if (includeAccountKey) {
    includeAccountId = getAccountId(accounts, includeAccountKey);
    if (!includeAccountId) {
      throw new Error(`Cannot find account ${includeAccountKey}`);
    }
  }

  const app = new cdk.App();

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

    const stack = child as cdk.Stack;
    const stackAccountId = stack.account;
    if (includeAccountId && includeAccountId !== stackAccountId) {
      console.info(`Skipping deployment of stack ${stack.stackName}`);
      app.node.tryRemoveChild(stack.node.id);
    }
  }
}

// tslint:disable-next-line: no-floating-promises
main();
