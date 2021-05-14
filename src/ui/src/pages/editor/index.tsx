/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { set } from 'mobx';
import { useAcceleratorConfig } from '@/components/accelerator-config-context';
import { DefaultAppLayout } from '@/pages/default/app-layout';
import Breadcrumbs from './breadcrumbs';
import Content from './content';

export default function EditorPage() {
  const state = useAcceleratorConfig();
  const [value, setValue] = useState('{}');

  const handleSave = () => {
    try {
      // TODO Validation?
      set(state, JSON.parse(value));
    } catch (e) {
      console.error(e);
    }
  };

  const handleReset = () => {
    setValue(JSON.stringify(state, null, 2));
  };

  // Reset value when state changes
  useEffect(handleReset, [state]);

  return (
    <DefaultAppLayout breadcrumbs={<Breadcrumbs onSave={handleSave} onReset={handleReset} />}>
      <Content value={value} setValue={setValue} />
    </DefaultAppLayout>
  );
}
