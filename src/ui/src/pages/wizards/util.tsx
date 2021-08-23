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
import { action } from 'mobx';
import { TypeTreeNode } from '@/types';
import { Path } from '@/components/fields';
import * as t from '@aws-accelerator/common-types';
import { valueAsArray } from '@/utils';

const DISABLED_KEY = '__disabled';

/**
 * Creates a hook that adds an additional "__enabled" field to the value of the given node to track if the value is enabled or not.
 */
export function useEnableNode<T extends t.Any>(
  node: TypeTreeNode<T>,
  state: any,
  createInitialValue?: () => t.TypeOf<T>,
): [boolean, (enabled: boolean) => void] {
  const enabled = node.get(state) != null && !isDisabled(state, node.path);

  const handleChange = action((value: boolean) => {
    let currentValue: any = node.get(state);
    if (value && currentValue == null && createInitialValue) {
      currentValue = createInitialValue();
      node.set(state, currentValue);
    }
    setDisabled(state, node.path, !value);
  });

  return [enabled, handleChange];
}

export function isDisabled(state: any, path: Path) {
  const disabled: any[] = valueAsArray(state[DISABLED_KEY]);
  return disabled.includes(path.join('/'));
}

export function setDisabled(state: any, path: Path, value: boolean) {
  const disabled: any[] = valueAsArray(state[DISABLED_KEY]);
  if (value) {
    state[DISABLED_KEY] = [...disabled, path.join('/')];
  } else {
    state[DISABLED_KEY] = disabled.filter(value => value !== path.join('/'));
  }
}

/**
 * Returns a copy of the given value omitting objects whose path is not in the __disabled array.
 */
export function removeDisabledObjects(value: any, disabled: string[] = value?.[DISABLED_KEY], path: Path = []): any {
  if (disabled && Array.isArray(disabled) && disabled.includes(path.join('/'))) {
    return undefined;
  } else if (value === null) {
    return value;
  } else if (Array.isArray(value)) {
    return value
      .map((value, index) => removeDisabledObjects(value, disabled, [...path, index]))
      .filter(value => !!value);
  } else if (typeof value === 'object') {
    // Create object with same key-value, only values are mapped by a recursive call to `removeDisabledObjects`
    return Object.fromEntries(
      Object.getOwnPropertyNames(value)
        .filter(key => key !== DISABLED_KEY)
        .map(key => [key, removeDisabledObjects(value[key], disabled, [...path, key])])
        .filter(([, value]) => value !== undefined),
    );
  }
  return value;
}
