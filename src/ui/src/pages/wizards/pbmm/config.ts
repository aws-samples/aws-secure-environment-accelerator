/* eslint-disable @typescript-eslint/no-explicit-any */
import { PbmmStepOne } from './step1';
import { PbmmStepTwo } from './step2';
import { PbmmStepThree } from './step3';
import * as t from '@aws-accelerator/common-types';

export type PbmmConfig = t.TypeOf<typeof PbmmConfig>;
export const PbmmConfig = t.intersection([PbmmStepOne, PbmmStepTwo, PbmmStepThree]);

// TODO return generated AcceleratorConfigType from PbmmConfig
export function createAcceleratorConfig(nistState: any): PbmmConfig {
  const state = parsePbmmState(nistState);
  const validation = PbmmConfig.validate(state, []);
  if (validation._tag === 'Right') {
    return validation.right;
  } else {
    throw validation.left;
  }
}

function parsePbmmState(pbmmState: any): any {
  const state: any = {};
  for (const stepKey in pbmmState) {
    if (pbmmState.hasOwnProperty(stepKey)) {
      const stepBody = pbmmState[stepKey];
      for (const parameterKey in stepBody) {
        if (stepBody.hasOwnProperty(parameterKey)) {
          state[parameterKey] = stepBody[parameterKey];
        }
      }
    }
  }
  return state;
}
