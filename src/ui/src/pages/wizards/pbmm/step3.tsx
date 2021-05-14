import * as t from '@aws-accelerator/common-types';

export const PbmmStepThree = t.definition('Pbmm Step Three', {
  PbmmStepThreeTest: t.string,
  'default-s3': t.number,
  'central-bucket': t.nonEmptyString,
});
