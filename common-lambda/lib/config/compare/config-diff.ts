import { DiffNew, DiffEdit, DiffDeleted, DiffArray, diff, Diff } from 'deep-diff';
// import { AcceleratorConfig } from '..';

// tslint:disable-next-line:no-any
export type LHS = any;
// tslint:disable-next-line:no-any
export type RHS = any;

export type DiffNewResult = DiffNew<RHS>;
export type DiffDeletedResult = DiffDeleted<LHS>;
export type DiffEditResult = DiffEdit<LHS, RHS>;
export type DiffArrayResult = DiffArray<LHS, RHS>;

/**
 * Auxiliary function to compare configurations
 */
export function compareConfiguration(original: LHS, modified: RHS): Diff<LHS, RHS>[] | undefined {
  const changes = diff(original, modified);
  return changes;
}

export function getDiffs(differences: Diff<LHS, RHS>[], kind: string): Diff<LHS, RHS>[] {
  return differences.filter(difference => difference.kind === kind);
}

export function getAccountNames(original: LHS): string[] {
  const accountNames: string[] = [];
  const mandatoryAccountConfigs: [string, LHS][] = Object.entries(original['mandatory-account-configs']);
  const workloadAccountConfigs: [string, LHS][] = Object.entries(original['workload-account-configs']);
  const mandatoryAccountNames = mandatoryAccountConfigs.map(([_, accountConfig]) => accountConfig['account-name']);
  accountNames.push(...mandatoryAccountNames);
  const workloadAccountNames = workloadAccountConfigs.map(([_, accountConfig]) => accountConfig['account-name']);
  accountNames.push(...workloadAccountNames);
  return accountNames;
}
