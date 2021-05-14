/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, FC, useContext, useEffect, VFC } from 'react';
import { autorun, observable, set, toJS } from 'mobx';
import { observer } from 'mobx-react-lite';

const AcceleratorConfigC = createContext<any>(undefined);

/**
 * Context provider that provides Accelerator configuration object.
 */
export const AcceleratorConfigProvider: FC = ({ children }) => {
  const acceleratorConfig = observable({});
  return <AcceleratorConfigC.Provider value={acceleratorConfig}>{children}</AcceleratorConfigC.Provider>;
};

export function useAcceleratorConfig() {
  return useContext(AcceleratorConfigC)!;
}

/**
 * This functional component synchronizes the Accelerator configuration to local storage.
 */
export const SyncAcceleratorConfig: VFC<{ key?: string }> = observer(({ key = 'configuration' }) => {
  const configuration = useAcceleratorConfig();

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
});
