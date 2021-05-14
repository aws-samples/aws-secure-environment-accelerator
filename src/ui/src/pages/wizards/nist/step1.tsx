import * as t from '@aws-accelerator/common-types';

export type NistStepOne = t.TypeOf<typeof NistStepOne>;

export const NistStepOne = t.definition('Nist Step One', {
  NistStepOneTest: t.string,
  'default-s3-retention': t.number,
});
