import { action } from 'mobx';
import { TypeTreeNode } from '@/types';
import * as t from '@aws-accelerator/common-types';

const ENABLED_KEY = '__enabled';

/**
 * Creates a hook that adds an additional "__enabled" field to the value of the given node to track if the value is enabled or not.
 */
export function useEnableNode<T extends t.Any>(
  node: TypeTreeNode<T>,
  state: any,
  createInitialValue: () => t.TypeOf<T>,
): [boolean, (enabled: boolean) => void] {
  const value = node.get(state);
  const enabled = value != null && value[ENABLED_KEY] !== false;

  const handleChange = action((value: boolean) => {
    const currentValue: any = node.get(state);
    if (value) {
      if (!currentValue) {
        const initialValue: any = createInitialValue();
        initialValue[ENABLED_KEY] = true;
        node.set(state, initialValue);
      } else {
        currentValue[ENABLED_KEY] = true;
      }
    } else if (currentValue) {
      currentValue[ENABLED_KEY] = false;
    }
  });

  return [enabled, handleChange];
}

/**
 * Returns a copy of the given value omitting objects that have `__enabled === false`.
 */
export function removeDisabledObjects(value: any): any {
  if (value === null) {
    return value;
  } else if (Array.isArray(value)) {
    return value.map(removeDisabledObjects).filter(value => !!value);
  } else if (typeof value === 'object') {
    if (value[ENABLED_KEY] === false) {
      return undefined;
    }
    // Create object with same key-value, only values are mapped by a recursive call to `removeDisabledObjects`
    return Object.fromEntries(
      Object.getOwnPropertyNames(value)
        .filter(key => key !== ENABLED_KEY)
        .map(key => [key, removeDisabledObjects(value[key])])
        .filter(([, value]) => value !== undefined),
    );
  }
  return value;
}
