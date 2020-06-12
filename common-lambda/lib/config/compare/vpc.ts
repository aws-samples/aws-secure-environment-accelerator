import { Diff, DiffEdit, DiffArray, DiffDeleted } from 'deep-diff';
import { getDiffs, RHS, LHS } from '../../aws/config-diff';

export async function deletedConfig(
  diffs: Diff<any, any>[],
  pathValue: string,
): Promise<void | undefined> {
  const deletedDiffs = getDiffs(diffs, 'D');
  // console.log('deletedDiffs', deletedDiffs);
  if (!deletedDiffs) {
    console.log('no deletes detected');
    return;
  }

  for (const deletedDiff of deletedDiffs) {
    if (!deletedDiff.path) {
      return;
    }
    const changedValue = deletedDiff.path[deletedDiff.path.length - 1];
    if (changedValue === pathValue) {
      throw new Error(`removed account "${changedValue}" from config path "${deletedDiff.path.join('/')}"`);
    }
  }
}

export async function deletedConfigDependency(
  diffs: Diff<any, any>[],
  pathValue: string,
): Promise<void | undefined> {
  const updatedDiffs = getDiffs(diffs, 'E');
  // console.log('deletedDiffs', deletedDiffs);
  const editedDiffs = updatedDiffs as DiffEdit<LHS, RHS>[];
  if (!editedDiffs) {
    console.log('no edit changes detected');
    return;
  }

  for (const editedDiff of editedDiffs) {
    // const found = editedDiff.path?.some(r => VPC_VALUES.includes(r))
    const changedValue = editedDiff.path?.[editedDiff.path?.length - 1];
    if (changedValue === pathValue && editedDiff.lhs) {
      throw new Error(`removed/changed ${pathValue} configuration from config path "${editedDiff.path?.join('/')}"`);
    }
  }
}

export async function deletedConfigDependencyArray(
  diffs: Diff<any, any>[],
  pathValue: string,
): Promise<void | undefined> {
  const arrayDiffs = getDiffs(diffs, 'A');
  // console.log('deletedDiffs', deletedDiffs);
  const editedArrayDiffs = arrayDiffs as DiffArray<LHS, RHS>[];
  if (!editedArrayDiffs) {
    console.log('no edit changes detected');
    return;
  }

  for (const editedArrayDiff of editedArrayDiffs) {
    if (editedArrayDiff.item.kind === 'D') {
      // const diffDelete = editedArrayDiff.item as DiffDeleted<LHS>;
      const changedValue = editedArrayDiff.path?.[editedArrayDiff.path?.length - 1];
      if (changedValue === pathValue) {
        throw new Error(`removed account "${changedValue}" in an array from config path "${editedArrayDiff.path?.join('/')}"`);
      }
    }
  }
}

export async function editedConfigDependency(
  diffs: Diff<any, any>[],
  pathValues: string[],
): Promise<void | undefined> {
  const updatedDiffs = getDiffs(diffs, 'E');
  // console.log('deletedDiffs', deletedDiffs);
  const editedDiffs = updatedDiffs as DiffEdit<LHS, RHS>[];
  if (!editedDiffs) {
    console.log('no edit changes detected');
    return;
  }

  for (const editedDiff of editedDiffs) {
    // const found = editedDiff.path?.some(r => VPC_VALUES.includes(r))
    const found = pathValues.every(r => editedDiff.path?.includes(r));
    if (found && editedDiff.lhs) {
      throw new Error(`removed/changed config path "${editedDiff.path?.join('/')}"`);
    }
  }
}

export async function editedConfigDependencyArray(
  diffs: Diff<any, any>[],
  pathValues: string[],
): Promise<void | undefined> {
  const arrayDiffs = getDiffs(diffs, 'A');
  // console.log('deletedDiffs', deletedDiffs);
  const editedArrayDiffs = arrayDiffs as DiffArray<LHS, RHS>[];
  if (!editedArrayDiffs) {
    console.log('no edit changes detected');
    return;
  }

  for (const editedArrayDiff of editedArrayDiffs) {
    if (editedArrayDiff.item.kind === 'D') {
      const found = pathValues.every(r => editedArrayDiff.path?.includes(r));
      if (found) {
        throw new Error(`removed ${pathValues[pathValues.length - 1]} from config path "${editedArrayDiff.path?.join('/')}"`);
      }
    }
  }
}