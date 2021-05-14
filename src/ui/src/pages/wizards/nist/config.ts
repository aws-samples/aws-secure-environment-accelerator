/* eslint-disable @typescript-eslint/no-explicit-any */
import { NistStepOne } from './step1';
import { NistStepTwo } from './step2';
import * as t from '@aws-accelerator/common-types';

export type NistConfig = t.TypeOf<typeof NistConfig>;
export const NistConfig = t.intersection([NistStepOne, NistStepTwo]);

// TODO return generated AcceleratorConfigType from NistConfig
export function createAcceleratorConfig(nistState: any): NistConfig {
  const state = parseNistState(nistState);
  const validation = NistConfig.validate(state, []);
  if (validation._tag === 'Right') {
    return validation.right;
  } else {
    throw validation.left;
  }
}

function parseNistState(nistState: any): any {
  const state: any = {};
  for (const stepKey in nistState) {
    if (nistState.hasOwnProperty(stepKey)) {
      const stepBody = nistState[stepKey];
      for (const parameterKey in stepBody) {
        if (stepBody.hasOwnProperty(parameterKey)) {
          state[parameterKey] = stepBody[parameterKey];
        }
      }
    }
  }

  return state;
}
