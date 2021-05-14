import { useState } from 'react';
import { WizardProps } from '@awsui/components-react';
import { NestedField } from '@/components/fields';
import { getTypeTree } from '@/types';
import { AcceleratorComponentState } from '@/pages/wizards';
import { NistStepOne } from './step1';
import { NistStepTwo } from './step2';
export { createAcceleratorConfig } from './config';

function StepOne(props: { state: AcceleratorComponentState }) {
  const [root] = useState(() => getTypeTree(NistStepOne, ['nist', 'step-one']));
  return <NestedField state={props.state} node={root} />;
}

function StepTwo(props: { state: AcceleratorComponentState }) {
  const [root] = useState(() => getTypeTree(NistStepTwo, ['nist', 'step-two']));
  return <NestedField state={props.state} node={root} />;
}

export function createNistSteps(state: AcceleratorComponentState): WizardProps.Step[] {
  return [
    {
      title: 'nist step 1',
      content: <StepOne state={state} />,
    },
    {
      title: 'nist step 2',
      content: <StepTwo state={state} />,
    },
  ];
}
