import { autorun, set, toJS } from 'mobx';
import { useEffect } from 'react';

export interface MobXSyncToLocalStorageProps {
  state: any;
  key: string;
}

export function MobXSyncToLocalStorage(props: MobXSyncToLocalStorageProps) {
  useMobXSyncToLocalStorage(props.state, props.key);
  return null;
}

export function useMobXSyncToLocalStorage(state: string, key: string) {
  useEffect(() => {
    const storedJson = localStorage.getItem(key);
    if (storedJson) {
      set(state, JSON.parse(storedJson));
    }
    const unsubscribe = autorun(() => {
      const value = toJS(state);
      localStorage.setItem(key, JSON.stringify(value));
    });
    return () => unsubscribe();
  }, []);
}
