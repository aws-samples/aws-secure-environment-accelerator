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

import { AssignedSubnetCidrPool, AssignedVpcCidrPool } from '../../../common-outputs/src/cidr-pools';
import { Diff, isDiffArray, isDiffEdit, isDiffDeleted, isDiffNew } from './config-diff';

export function deletedSubAccount(accountNames: string[], diffs: Diff[]): string[] {
  const errors = [];
  for (const deletedDiff of diffs.filter(isDiffDeleted)) {
    if (!deletedDiff.path) {
      continue;
    }
    const accountName = deletedDiff.path[deletedDiff.path.length - 1];
    if (accountNames.includes(accountName)) {
      errors.push(
        `ConfigCheck: blocked changing account name "${accountName}" from config path "${deletedDiff.path.join('/')}"`,
      );
    }
  }
  return errors;
}

export function matchEditedConfigPath(
  diffs: Diff[],
  pathValue: string,
  isChangeAllowed: boolean,
  pathLength?: number,
): string[] {
  const errors = [];
  for (const editedDiff of diffs.filter(isDiffEdit)) {
    const changedValue = editedDiff.path?.[editedDiff.path?.length - 1];
    if (
      changedValue === pathValue &&
      (isChangeAllowed ? editedDiff.lhs : true) &&
      (pathLength ? editedDiff.path?.length === pathLength : true)
    ) {
      errors.push(`ConfigCheck: blocked changing ${pathValue} from config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export function deletedConfigDependencyArray(diffs: Diff[], pathValue: string): string[] {
  const errors = [];
  for (const editedArrayDiff of diffs.filter(isDiffArray)) {
    if (editedArrayDiff.item.kind === 'D') {
      const changedValue = editedArrayDiff.path?.[editedArrayDiff.path?.length - 1];
      if (changedValue === pathValue) {
        errors.push(
          `ConfigCheck: blocked changing account "${changedValue}" from config path "${editedArrayDiff.path?.join(
            '/',
          )}"`,
        );
      }
    }
  }
  return errors;
}

export function editedConfigArray(diffs: Diff[], pathValues: string[]): string[] {
  const errors = [];
  for (const editedArrayDiff of diffs.filter(isDiffArray)) {
    const found = pathValues.every(r => editedArrayDiff.path?.includes(r));
    if (found) {
      errors.push(`ConfigCheck: blocked changing config path "${editedArrayDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export function editedConfigDependency(diffs: Diff[], pathValues: string[]): string[] {
  const errors = [];
  for (const editedDiff of diffs.filter(isDiffEdit)) {
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (found && editedDiff.lhs) {
      errors.push(`ConfigCheck: blocked changing config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export function matchEditedConfigDependency(diffs: Diff[], pathValues: string[], pathLength?: number): string[] {
  const errors = [];
  for (const editedDiff of diffs.filter(isDiffEdit)) {
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (found && editedDiff.lhs && (pathLength ? editedDiff.path?.length === pathLength : true)) {
      errors.push(`ConfigCheck: blocked changing config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export function matchBooleanConfigDependency(diffs: Diff[], pathValues: string[], pathLength?: number): string[] {
  const errors = [];
  for (const editedDiff of diffs.filter(isDiffEdit)) {
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (found && editedDiff.lhs !== undefined && (pathLength ? editedDiff.path?.length === pathLength : true)) {
      errors.push(`ConfigCheck: blocked changing config path "${editedDiff.path?.join('/')}"`);
    }
  }

  for (const newDiff of diffs.filter(isDiffNew)) {
    const found = pathValues.every(r => newDiff.path?.includes(r));
    if (found && (pathLength ? newDiff.path?.length === pathLength : true)) {
      errors.push(`ConfigCheck: blocked changing config path "${newDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export function matchEditedConfigPathValues(
  diffs: Diff[],
  pathValues: string[],
  isChangeAllowed: boolean,
  pathLength?: number,
): string[] {
  const errors = [];
  for (const editedDiff of diffs.filter(isDiffEdit)) {
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (
      found &&
      (isChangeAllowed ? editedDiff.lhs : true) &&
      (pathLength ? editedDiff.path?.length === pathLength : true)
    ) {
      errors.push(`ConfigCheck: blocked changing config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export function matchEditedConfigPathDisabled(diffs: Diff[], pathValues: string[], pathLength?: number): string[] {
  const errors = [];
  for (const editedDiff of diffs.filter(isDiffEdit)) {
    // const found = editedDiff.path?.some(r => VPC_VALUES.includes(r))
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (found && (!editedDiff.lhs ? true : false) && (pathLength ? editedDiff.path?.length === pathLength : true)) {
      errors.push(`ConfigCheck: blocked changing config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export function matchConfigPath(diffs: Diff[], pathValues: string[]): string[] {
  const errors = [];
  for (const editedDiff of diffs.filter(isDiffEdit)) {
    const found = editedDiff.path?.every(r => pathValues.includes(r));
    if (found && editedDiff.lhs) {
      errors.push(`ConfigCheck: blocked changing config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export function matchConfigDependencyArray(diffs: Diff[], pathValues: string[], pathLength?: number): string[] {
  const errors = [];
  for (const editedArrayDiff of diffs.filter(isDiffArray)) {
    if (editedArrayDiff.item.kind === 'D') {
      const found = pathValues.every(r => editedArrayDiff.path?.includes(r));
      if (found && (pathLength ? editedArrayDiff.path?.length === pathLength : true)) {
        errors.push(
          `ConfigCheck: blocked changing ${
            pathValues[pathValues.length - 1]
          } from config path "${editedArrayDiff.path?.join('/')}"`,
        );
      }
    }
  }
  return errors;
}

export function deletedConfigEntry(diffs: Diff[], pathValues: string[], pathValue: string): string[] {
  const errors: string[] = [];
  for (const deletedDiff of diffs.filter(isDiffDeleted)) {
    if (!deletedDiff.path) {
      continue;
    }
    const found = pathValues.every(r => deletedDiff.path?.includes(r));
    const changedValue = deletedDiff.path?.[deletedDiff.path?.length - 1];
    if (found && changedValue === pathValue) {
      errors.push(`ConfigCheck: blocked deleting  "${changedValue}" from config path "${deletedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export function getAssigndVpcCidrs(
  vpcPools: AssignedVpcCidrPool[],
  accountKey: string,
  vpcName: string,
  region: string,
  ouKey?: string,
): AssignedVpcCidrPool[] {
  let vpcAssignedCidrs = vpcPools.filter(
    vpcPool => vpcPool['account-Key'] === accountKey && vpcPool['vpc-name'] === vpcName && vpcPool.region === region,
  );
  if (vpcAssignedCidrs.length === 0) {
    vpcAssignedCidrs = vpcPools.filter(
      vpcPool =>
        vpcPool['account-ou-key'] === `account/${accountKey}` &&
        vpcPool['vpc-name'] === vpcName &&
        vpcPool.region === region,
    );
  }
  if (vpcAssignedCidrs.length === 0 && ouKey) {
    vpcAssignedCidrs = vpcPools.filter(
      vpcPool =>
        vpcPool['account-ou-key'] === `organizational-unit/${ouKey}` &&
        vpcPool['vpc-name'] === vpcName &&
        vpcPool.region === region,
    );
  }
  return vpcAssignedCidrs;
}

export function getAssigndVpcSubnetCidrs(
  subnetPools: AssignedSubnetCidrPool[],
  accountKey: string,
  vpcName: string,
  region: string,
  ouKey?: string,
): AssignedSubnetCidrPool[] {
  let subnetAssignedCidrs = subnetPools.filter(
    subnetPool =>
      subnetPool['account-Key'] === accountKey && subnetPool['vpc-name'] === vpcName && subnetPool.region === region,
  );
  if (subnetAssignedCidrs.length === 0) {
    subnetAssignedCidrs = subnetPools.filter(
      subnetPool =>
        subnetPool['account-ou-key'] === `account/${accountKey}` &&
        subnetPool['vpc-name'] === vpcName &&
        subnetPool.region === region,
    );
  }
  if (subnetAssignedCidrs.length === 0 && ouKey) {
    subnetAssignedCidrs = subnetPools.filter(
      subnetPool =>
        subnetPool['account-ou-key'] === `organizational-unit/${ouKey}` &&
        subnetPool['vpc-name'] === vpcName &&
        subnetPool.region === region,
    );
  }
  return subnetAssignedCidrs;
}
