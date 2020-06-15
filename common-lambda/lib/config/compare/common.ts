import { Diff, DiffEdit, DiffArray } from 'deep-diff';
import { getDiffs, RHS, LHS } from '../../aws/config-diff';

export async function deletedSubAccount(
  accountNames: string[],
  diffs: Diff<LHS, RHS>[],
): Promise<string[] | undefined> {
  const deletedDiffs = getDiffs(diffs, 'D');
  // console.log('deletedDiffs', deletedDiffs);
  if (!deletedDiffs) {
    console.log('no deletes detected');
    return;
  }

  const errors = [];
  for (const deletedDiff of deletedDiffs) {
    if (!deletedDiff.path) {
      return;
    }
    const accountName = deletedDiff.path[deletedDiff.path.length - 1];
    if (accountNames.includes(accountName)) {
      errors.push(`blocked changing account name "${accountName}" from config path "${deletedDiff.path.join('/')}"`);
    }
  }
  return errors;
}

export async function matchEditedConfigPath(
  diffs: Diff<LHS, RHS>[],
  pathValue: string,
  isChangeAllowed: boolean,
  pathLength?: number,
): Promise<string[] | undefined> {
  const updatedDiffs = getDiffs(diffs, 'E');
  // console.log('deletedDiffs', deletedDiffs);
  const editedDiffs = updatedDiffs as DiffEdit<LHS, RHS>[];
  if (!editedDiffs) {
    console.log('no edit changes detected');
    return;
  }

  const errors = [];
  for (const editedDiff of editedDiffs) {
    // const found = editedDiff.path?.some(r => VPC_VALUES.includes(r))
    const changedValue = editedDiff.path?.[editedDiff.path?.length - 1];
    if (
      changedValue === pathValue &&
      (isChangeAllowed ? editedDiff.lhs : true) &&
      (pathLength ? editedDiff.path?.length === pathLength : true)
    ) {
      errors.push(`blocked changing ${pathValue} configuration from config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export async function deletedConfigDependencyArray(
  diffs: Diff<LHS, RHS>[],
  pathValue: string,
): Promise<string[] | undefined> {
  const arrayDiffs = getDiffs(diffs, 'A');
  // console.log('deletedDiffs', deletedDiffs);
  const editedArrayDiffs = arrayDiffs as DiffArray<LHS, RHS>[];
  if (!editedArrayDiffs) {
    console.log('no edit changes detected');
    return;
  }

  const errors = [];
  for (const editedArrayDiff of editedArrayDiffs) {
    if (editedArrayDiff.item.kind === 'D') {
      // const diffDelete = editedArrayDiff.item as DiffDeleted<LHS>;
      const changedValue = editedArrayDiff.path?.[editedArrayDiff.path?.length - 1];
      if (changedValue === pathValue) {
        errors.push(
          `blocked changing account "${changedValue}" in an array from config path "${editedArrayDiff.path?.join(
            '/',
          )}"`,
        );
      }
    }
  }
  return errors;
}

export async function editedConfigArray(diffs: Diff<LHS, RHS>[], pathValues: string[]): Promise<string[] | undefined> {
  const arrayDiffs = getDiffs(diffs, 'A');
  // console.log('deletedDiffs', deletedDiffs);
  const editedArrayDiffs = arrayDiffs as DiffArray<LHS, RHS>[];
  if (!editedArrayDiffs) {
    console.log('no edit changes detected');
    return;
  }

  const errors = [];
  for (const editedArrayDiff of editedArrayDiffs) {
    const found = pathValues.every(r => editedArrayDiff.path?.includes(r));
    if (found) {
      errors.push(`blocked changing from config path "${editedArrayDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export async function editedConfigDependency(
  diffs: Diff<LHS, RHS>[],
  pathValues: string[],
): Promise<string[] | undefined> {
  const updatedDiffs = getDiffs(diffs, 'E');
  // console.log('deletedDiffs', deletedDiffs);
  const editedDiffs = updatedDiffs as DiffEdit<LHS, RHS>[];
  if (!editedDiffs) {
    console.log('no edit changes detected');
    return;
  }

  const errors = [];
  for (const editedDiff of editedDiffs) {
    // const found = editedDiff.path?.some(r => VPC_VALUES.includes(r))
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (found && editedDiff.lhs) {
      errors.push(`blocked changing config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export async function matchEditedConfigDependency(
  diffs: Diff<LHS, RHS>[],
  pathValues: string[],
  pathLength?: number,
): Promise<string[] | undefined> {
  const updatedDiffs = getDiffs(diffs, 'E');
  // console.log('deletedDiffs', deletedDiffs);
  const editedDiffs = updatedDiffs as DiffEdit<LHS, RHS>[];
  if (!editedDiffs) {
    console.log('no edit changes detected');
    return;
  }

  const errors = [];
  for (const editedDiff of editedDiffs) {
    // const found = editedDiff.path?.some(r => VPC_VALUES.includes(r))
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (found && editedDiff.lhs && (pathLength ? editedDiff.path?.length === pathLength : true)) {
      errors.push(`blocked changing config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export async function matchEditedConfigPathValues(
  diffs: Diff<LHS, RHS>[],
  pathValues: string[],
  isChangeAllowed: boolean,
  pathLength?: number,
): Promise<string[] | undefined> {
  const updatedDiffs = getDiffs(diffs, 'E');
  // console.log('deletedDiffs', deletedDiffs);
  const editedDiffs = updatedDiffs as DiffEdit<LHS, RHS>[];
  if (!editedDiffs) {
    console.log('no edit changes detected');
    return;
  }

  const errors = [];
  for (const editedDiff of editedDiffs) {
    // const found = editedDiff.path?.some(r => VPC_VALUES.includes(r))
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (
      found &&
      (isChangeAllowed ? editedDiff.lhs : true) &&
      (pathLength ? editedDiff.path?.length === pathLength : true)
    ) {
      errors.push(`blocked changing configuration from config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export async function matchEditedConfigPathDisabled(
  diffs: Diff<LHS, RHS>[],
  pathValues: string[],
  pathLength?: number,
): Promise<string[] | undefined> {
  const updatedDiffs = getDiffs(diffs, 'E');
  // console.log('deletedDiffs', deletedDiffs);
  const editedDiffs = updatedDiffs as DiffEdit<LHS, RHS>[];
  if (!editedDiffs) {
    console.log('no edit changes detected');
    return;
  }

  const errors = [];
  for (const editedDiff of editedDiffs) {
    // const found = editedDiff.path?.some(r => VPC_VALUES.includes(r))
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (found && (!editedDiff.lhs ? true : false) && (pathLength ? editedDiff.path?.length === pathLength : true)) {
      errors.push(`blocked changing configuration from config path "${editedDiff.path?.join('/')}"`);
    }
  }
  return errors;
}

export async function matchConfigPath(diffs: Diff<LHS, RHS>[], pathValues: string[]): Promise<string | undefined> {
  const updatedDiffs = getDiffs(diffs, 'E');
  // console.log('deletedDiffs', deletedDiffs);
  const editedDiffs = updatedDiffs as DiffEdit<LHS, RHS>[];
  if (!editedDiffs) {
    console.log('no edit changes detected');
    return;
  }

  for (const editedDiff of editedDiffs) {
    // const found = editedDiff.path?.some(r => VPC_VALUES.includes(r))
    const found = editedDiff.path?.every(r => pathValues.includes(r));
    if (found && editedDiff.lhs) {
      return `blocked changing config path "${editedDiff.path?.join('/')}"`;
    }
  }
}

export async function matchConfigDependencyArray(
  diffs: Diff<LHS, RHS>[],
  pathValues: string[],
  pathLength?: number,
): Promise<string[] | undefined> {
  const arrayDiffs = getDiffs(diffs, 'A');
  // console.log('deletedDiffs', deletedDiffs);
  const editedArrayDiffs = arrayDiffs as DiffArray<LHS, RHS>[];
  if (!editedArrayDiffs) {
    console.log('no edit changes detected');
    return;
  }

  const errors = [];
  for (const editedArrayDiff of editedArrayDiffs) {
    if (editedArrayDiff.item.kind === 'D') {
      const found = pathValues.every(r => editedArrayDiff.path?.includes(r));
      if (found && (pathLength ? editedArrayDiff.path?.length === pathLength : true)) {
        errors.push(
          `blocked changing ${pathValues[pathValues.length - 1]} from config path "${editedArrayDiff.path?.join('/')}"`,
        );
      }
    }
  }
  return errors;
}
