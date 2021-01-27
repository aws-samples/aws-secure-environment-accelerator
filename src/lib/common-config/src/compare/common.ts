import { Diff, isDiffArray, isDiffEdit, isDiffDeleted } from './config-diff';

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

export function deletedConfigEntry(diffs: Diff[], pathValue: string): string[] {
  const errors: string[] = [];
  for (const deletedDiff of diffs.filter(isDiffDeleted)) {
    if (!deletedDiff.path) {
      continue;
    }
    const changedValue = deletedDiff.path?.[deletedDiff.path?.length - 1];
    if (changedValue === pathValue) {
      errors.push(`ConfigCheck: blocked deleting  "${changedValue}" from config path "${deletedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}
