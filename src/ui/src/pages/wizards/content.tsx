/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Wizard, WizardProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { getTypeTree } from '@/types';
import { Field } from '@/components/fields';
import { createNistSteps, createAcceleratorConfig as createNistConfig } from './nist';
import { createPbmmSteps, createAcceleratorConfig as createPbmmConfig } from './pbmm';
import { observable } from 'mobx';

const FrameworkType = t.enums('Options', ['pbmm', 'nist']);
export type FrameworkType = t.TypeOf<typeof FrameworkType>;

export interface AcceleratorComponentState {
  frameworkType: FrameworkType;
}

const state = observable<AcceleratorComponentState>({
  frameworkType: 'pbmm',
});

export default observer(function Content(): React.ReactElement {
  const [root] = useState(() => getTypeTree(FrameworkType, ['frameworkType']));
  const chooseFrameworkStep = {
    title: 'step1',
    content: <Field state={state} node={root} />,
  };

  let frameworkSteps: WizardProps.Step[] = [];

  if (state.frameworkType === 'pbmm') {
    frameworkSteps = createPbmmSteps(state);
  } else if (state.frameworkType === 'nist') {
    frameworkSteps = createNistSteps(state);
  }

  return (
    <Wizard
      steps={[chooseFrameworkStep, ...frameworkSteps]}
      i18nStrings={{
        cancelButton: 'cancel',
        nextButton: 'next',
        previousButton: 'previous',
        submitButton: 'submit',
        collapsedStepsLabel: (stepNumber, stepsCount) => `step ${stepNumber}`,
        stepNumberLabel: stepNumber => `step ${stepNumber}`,
      }}
      onSubmit={() => routeSubmit('state')}
    ></Wizard>
  );
});

function routeSubmit(name: string) {
  const storedJson = localStorage.getItem(name);

  if (storedJson) {
    const state = JSON.parse(storedJson);
    if (state.frameworkType === 'pbmm') {
      createPbmmConfig(state.pbmm);
    } else if (state.frameworkType === 'nist') {
      createNistConfig(state.nist);
    }
  }
}
