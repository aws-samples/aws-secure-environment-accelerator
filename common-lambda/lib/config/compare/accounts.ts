import { Diff, DiffEdit, DiffArray, DiffDeleted } from 'deep-diff';
import { getDiffs, RHS, LHS } from '../../aws/config-diff';

export async function deletedSubAccount (
    accountNames: string[],
    diffs: Diff<any, any>[],
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
      const accountName = deletedDiff.path[deletedDiff.path.length - 1];
      if (accountNames.includes(accountName)) {
        throw new Error(`removed account "${accountName}" from config path "${deletedDiff.path.join('/')}"`);
      }
    }
  }

//   export async function editedAccountDependency (
//     accountNames: string[],
//     diffs: Diff<any, any>[],
//   ): Promise<void | undefined> {
//     const deletedDiffs = getDiffs(diffs, 'E');
//     // console.log('deletedDiffs', deletedDiffs);
//     const editedDiffs = deletedDiffs as DiffEdit<LHS, RHS>[];
//     if (!editedDiffs) {
//       console.log('no edit changes detected');
//       return;
//     }

//     for (const editedDiff of editedDiffs) {
//       const accountName = editedDiff.lhs;
//       if (accountNames.includes(accountName)) {
//         throw new Error(`removed/changed account "${accountName}" from config path "${editedDiff.path?.join('/')}"`);
//       }
//     }
//   }

//   export async function editedAccountDependencyArray (
//     accountNames: string[],
//     diffs: Diff<any, any>[],
//   ): Promise<void | undefined>  {
//     const deletedDiffs = getDiffs(diffs, 'A');
//     // console.log('deletedDiffs', deletedDiffs);
//     const editedDiffs = deletedDiffs as DiffArray<LHS, RHS>[];
//     if (!editedDiffs) {
//       console.log('no edit changes detected');
//       return;
//     }

//     for (const editedDiff of editedDiffs) {
//       if (editedDiff.item.kind === 'D') {
//         const diffDelete = editedDiff.item as DiffDeleted<LHS>;
//         const accountName = diffDelete.lhs;
//         if (accountNames.includes(accountName)) {
//           throw new Error(`removed account "${accountName}" in an array from config path "${editedDiff.path?.join('/')}"`);
//         }
//       }
//     }
//   }