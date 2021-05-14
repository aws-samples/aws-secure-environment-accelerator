import * as t from '@aws-accelerator/common-types';

export const PbmmStepOne = t.definition('Pbmm Step One', {
  PbmmStepOneTest: t.string,
  'alz-baseline': t.boolean,
  'ct-baseline': t.boolean,
  'default-s3-retention': t.number,
});
