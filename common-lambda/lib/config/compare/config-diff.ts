import * as diff from 'deep-diff';

// tslint:disable-next-line:no-any
export type LHS = any;
// tslint:disable-next-line:no-any
export type RHS = any;

export type Diff = diff.Diff<LHS, RHS>;
export type DiffNew = diff.DiffNew<RHS>;
export type DiffDeleted = diff.DiffDeleted<LHS>;
export type DiffEdit = diff.DiffEdit<LHS, RHS>;
export type DiffArray = diff.DiffArray<LHS, RHS>;

export type DiffKind = DiffNew['kind'] | DiffDeleted['kind'] | DiffEdit['kind'] | DiffArray['kind'];

/**
 * Auxiliary function to compare configurations
 */
export function compareConfiguration(original: LHS, modified: RHS): Diff[] | undefined {
  return diff.diff(original, modified);
}

export function isDiffNew(diff: Diff): diff is DiffNew {
  return diff.kind === 'N';
}

export function isDiffEdit(diff: Diff): diff is DiffEdit {
  return diff.kind === 'E';
}

export function isDiffDeleted(diff: Diff): diff is DiffDeleted {
  return diff.kind === 'D';
}

export function isDiffArray(diff: Diff): diff is DiffArray {
  return diff.kind === 'A';
}

export function getAccountNames(original: LHS): string[] {
  const mandatoryAccountConfigs: [string, LHS][] = Object.entries(original['mandatory-account-configs']);
  const workloadAccountConfigs: [string, LHS][] = Object.entries(original['workload-account-configs']);
  const mandatoryAccountNames = mandatoryAccountConfigs.map(([_, accountConfig]) => accountConfig['account-name']);
  const workloadAccountNames = workloadAccountConfigs.map(([_, accountConfig]) => accountConfig['account-name']);
  return [...mandatoryAccountNames, ...workloadAccountNames];
}
