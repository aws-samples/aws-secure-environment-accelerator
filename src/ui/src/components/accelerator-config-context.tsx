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
import { createContext, FC, useContext, VFC } from 'react';
import { observable } from 'mobx';
import { MobXSyncToStorage } from '@/components/mobx-sync-storage';

interface ObservableContext {
  getObservable(name?: string): any;
}

const ObservableC = createContext<ObservableContext | undefined>(undefined);

/**
 * Context provider that provides MobX observables.
 */
export const ObservableProvider: FC = ({ children }) => {
  const observableByNameMap = new Map();
  return (
    <ObservableC.Provider
      value={{
        getObservable: (name = 'default') => {
          if (observableByNameMap.has(name)) {
            return observableByNameMap.get(name);
          }
          const observableValue = observable({});
          observableByNameMap.set(name, observableValue);
          return observableValue;
        },
      }}
    >
      {children}
    </ObservableC.Provider>
  );
};

export function useObservable(name?: string) {
  const context = useContext(ObservableC);
  if (!context) {
    throw new Error(`"useObservable" should only be used inside ObservableProvider`);
  }
  return context.getObservable(name);
}
/**
 * This functional component synchronizes the MobX observable to local storage.
 */
export const SyncObservable: VFC<{ storageKey?: string; name?: string }> = ({
  name = 'default',
  storageKey = `state.${name}`,
}) => {
  const configuration = useObservable(name);
  return <MobXSyncToStorage state={configuration} storageKey={storageKey} />;
};
