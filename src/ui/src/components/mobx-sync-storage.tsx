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

import { action, autorun, set, toJS } from 'mobx';
import { useEffect } from 'react';

export interface MobXSyncToLocalProps {
  state: any;
  storageKey: string;
}

export function MobXSyncToStorage(props: MobXSyncToLocalProps) {
  useMobXSyncToStorage(props.state, props.storageKey);
  return null;
}

export function useMobXSyncToStorage(state: string, storageKey: string) {
  useEffect(
    action(() => {
      const storedJson = window.sessionStorage.getItem(storageKey);
      if (storedJson) {
        set(state, JSON.parse(storedJson));
      }
      const unsubscribe = autorun(() => {
        const value = toJS(state);
        window.sessionStorage.setItem(storageKey, JSON.stringify(value));
      });
      return () => unsubscribe();
    }),
    [],
  );
}
