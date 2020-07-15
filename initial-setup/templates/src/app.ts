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
  phaseId: string;
  region?: string;
  accountKey?: string;
  useTempOutputDir?: boolean;
}

export async function deploy(props: AppProps): Promise<cdk.Stage[]> {
  const { accountKey, phaseId, region, useTempOutputDir } = props;
  const phase = phases.find(p => p.id === phaseId);
  if (!phase) {
    throw new Error(`Cannot find phase with ID ${phaseId}`);
  }

  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const context = loadContext();
  const limits = await loadLimits();
  const limiter = new Limiter(limits);
  const outputs = await loadStackOutputs();

  const includeRegion = region;
  const includeAccountKey = accountKey;
  let includeAccountId: string | undefined;
  if (includeAccountKey) {
    includeAccountId = getAccountId(accounts, includeAccountKey);
    if (!includeAccountId) {
      throw new Error(`Cannot find account ${includeAccountKey}`);
    }
  }

  const accountStacks = new AccountStacks({
    phase: phase.name,
    accounts,
    context,
    useTempOutputDir,
  });

  for (const account of accounts) {
    for (const supportedRegion of acceleratorConfig["global-options"]["supported-regions"]) {
      accountStacks.tryGetOrCreateAccountStack(account.key, supportedRegion);
    }
  }

  const runner = await phase.runner();
  await runner({
    acceleratorConfig,
    accountStacks,
    accounts,
    context,
    limiter,
    outputs,
  });

  const apps = accountStacks.apps.filter(app => {
    if (includeAccountId && includeAccountId !== app.accountId) {
      console.log(`Skipping app deployment for account ${app.accountKey} and region ${app.region}`);
      return false;
    }
    if (includeRegion && includeRegion !== app.region) {
      console.log(`Skipping app deployment for account ${app.accountKey} and region ${app.region}`);
      return false;
    }
    return true;
  });
  return apps;
}
