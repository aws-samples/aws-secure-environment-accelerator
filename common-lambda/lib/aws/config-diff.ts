import { diff, Diff } from 'deep-diff';
import { DiffNew, DiffEdit, DiffDeleted, DiffArray } from 'deep-diff';
import { AcceleratorConfig } from '../config';

// tslint:disable-next-line:no-any
export type LHS = any;
// tslint:disable-next-line:no-any
export type RHS = any;

export type DiffNewResult<RHS> = DiffNew<RHS>;
export type DiffDeletedResult<LHS> = DiffDeleted<LHS>;
export type DiffEditResult<LHS, RHS> = DiffEdit<LHS, RHS>;
export type DiffArrayResult<LHS, RHS> = DiffArray<LHS, RHS>;

/**
 * Auxiliary function to compare configurations
 */
export function compareConfiguration(
  original: AcceleratorConfig,
  modified: AcceleratorConfig,
): Array<Diff<LHS, RHS>> | undefined {
  const changes = diff(original, modified);
  return changes;
}

export function getDiffs(
  differences: Diff<LHS, RHS>[], kind: string
): Diff<LHS, RHS>[] {
  const filterDifferences: Diff<LHS, RHS>[] = [];
  for (const difference of differences) {
    if (difference.kind === kind) {
      filterDifferences.push(difference);
    }
  }
  return filterDifferences;
}
