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
