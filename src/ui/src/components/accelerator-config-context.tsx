/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, FC, useContext, useEffect, VFC } from 'react';
import { autorun, observable, set, toJS } from 'mobx';
import { observer } from 'mobx-react-lite';

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
export const SyncObservable: VFC<{ key?: string; name?: string }> = observer(
  ({ name = 'default', key = `state.${name}` }) => {
    const configuration = useObservable(name);

    useEffect(() => {
      const storedJson = localStorage.getItem(key);
      if (storedJson) {
        set(configuration, JSON.parse(storedJson));
      }
      const unsubscribe = autorun(() => {
        const value = toJS(configuration);
        localStorage.setItem(key, JSON.stringify(value));
      });
      return () => unsubscribe();
    }, []);

    return null;
  },
);
