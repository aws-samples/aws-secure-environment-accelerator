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
