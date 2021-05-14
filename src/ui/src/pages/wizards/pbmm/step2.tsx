import * as t from '@aws-accelerator/common-types';

export const PbmmStepTwo = t.definition('Pbmm Step Two', {
  PbmmStepTwoTest: t.string,
  'default-s3-retention': t.number,
});
