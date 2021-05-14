import * as t from '@aws-accelerator/common-types';

export type NistStepTwo = t.TypeOf<typeof NistStepTwo>;

export const NistStepTwo = t.definition('NistStepTwo', {
  NistStepTwoTest: t.string,
  'central-bucket': t.nonEmptyString,
});
