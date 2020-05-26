import * as cdk from '@aws-cdk/core';
import * as apps from './apps';
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
const ACCELERATOR_ACCOUNT_KEY = process.env.ACCELERATOR_ACCOUNT_KEY;
const ACCELERATOR_REGION = process.env.ACCELERATOR_REGION;

interface PhaseInfo {
  runner: apps.Phase;
  name: string;
  id: string;
}
const phases: PhaseInfo[] = [
  {
    runner: apps.phase0,
    id: 'apps/phase-0.ts',
    name: '0',
  },
  {
    runner: apps.phase1,
    id: 'apps/phase-1.ts',
    name: '1',
  },
  {
    runner: apps.phase2,
    id: 'apps/phase-2.ts',
    name: '2',
  },
  {
    runner: apps.phase3,
    id: 'apps/phase-3.ts',
    name: '3',
  },
  {
    runner: apps.phase4,
    id: 'apps/phase-4.ts',
    name: '4',
  },
  {
    runner: apps.phase5,
    id: 'apps/phase-5.ts',
    name: '5',
  },
];

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

  const app = new cdk.App();

  const accountStacks = new AccountStacks(app, {
    phase: phase.name,
    accounts,
    context,
  });

  await phase.runner({
    acceleratorConfig,
    accountStacks,
    accounts,
    app,
    context,
    limiter,
    outputs,
  });

  // Only deploy stacks for the given account
  if (ACCELERATOR_ACCOUNT_KEY) {
    const accountId = getAccountId(accounts, ACCELERATOR_ACCOUNT_KEY);

    const children = app.node.findAll();
    for (const child of children) {
      if (!(child instanceof cdk.Stack)) {
        continue;
      }

      const stack = child as cdk.Stack;
      const stackAccountId = stack.account;
      if (accountId !== stackAccountId) {
        console.info(`Skipping deployment of stack ${stack.stackName}`);
        app.node.tryRemoveChild(stack.node.id);
      }
    }
  }
}

// tslint:disable-next-line: no-floating-promises
main();
