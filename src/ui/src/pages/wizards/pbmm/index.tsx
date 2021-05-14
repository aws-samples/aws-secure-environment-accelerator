import { useState } from 'react';
import { WizardProps } from '@awsui/components-react';
import { NestedField } from '@/components/fields';
import { getTypeTree } from '@/types';
import { AcceleratorComponentState } from '@/pages/wizards';
import { PbmmStepOne } from './step1';
import { PbmmStepTwo } from './step2';
import { PbmmStepThree } from './step3';
export { createAcceleratorConfig } from './config';

function StepOne(props: { state: AcceleratorComponentState }) {
  const [root] = useState(() => getTypeTree(PbmmStepOne, ['pbmm', 'step-one']));
  return <NestedField state={props.state} node={root} />;
}

function StepTwo(props: { state: AcceleratorComponentState }) {
  const [root] = useState(() => getTypeTree(PbmmStepTwo, ['pbmm', 'step-two']));
  return <NestedField state={props.state} node={root} />;
}

function StepThree(props: { state: AcceleratorComponentState }) {
  const [root] = useState(() => getTypeTree(PbmmStepThree, ['pbmm', 'step-three']));
  return <NestedField state={props.state} node={root} />;
}

export function createPbmmSteps(state: AcceleratorComponentState): WizardProps.Step[] {
  return [
    {
      title: 'pbmm step 1',
      content: <StepOne state={state} />,
    },
    {
      title: 'pbmm step 2',
      content: <StepTwo state={state} />,
    },
    {
      title: 'pbmm step 3',
      content: <StepThree state={state} />,
    },
  ];
}
