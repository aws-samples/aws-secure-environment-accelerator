/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as diff from 'deep-diff';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LHS = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export function isDiffNew(difference: Diff): difference is DiffNew {
  return difference.kind === 'N';
}

export function isDiffEdit(difference: Diff): difference is DiffEdit {
  return difference.kind === 'E';
}

export function isDiffDeleted(difference: Diff): difference is DiffDeleted {
  return difference.kind === 'D';
}

export function isDiffArray(difference: Diff): difference is DiffArray {
  return difference.kind === 'A';
}

export function getAccountNames(original: LHS): string[] {
  const mandatoryAccountConfigs: [string, LHS][] = Object.entries(original['mandatory-account-configs']);
  const workloadAccountConfigs: [string, LHS][] = Object.entries(original['workload-account-configs']);
  const mandatoryAccountNames = mandatoryAccountConfigs.map(([_, accountConfig]) => accountConfig['account-name']);
  const workloadAccountNames = workloadAccountConfigs.map(([_, accountConfig]) => accountConfig['account-name']);
  return [...mandatoryAccountNames, ...workloadAccountNames];
}
