/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { set } from 'mobx';
import { useObservable } from '@/components/accelerator-config-context';
import { DefaultAppLayout } from '@/pages/default/app-layout';
import Breadcrumbs from './breadcrumbs';
import Content from './content';

export default function EditorPage() {
  const state = useObservable();
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
      <Content value={value} onChange={setValue} />
    </DefaultAppLayout>
  );
}
