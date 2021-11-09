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

import { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { CheckboxProps, InputProps } from '@awsui/components-react';
import { Path } from '@/components/fields';

export const useEffectAsync = (fn: () => Promise<void>, deps?: ReadonlyArray<unknown>): void =>
  useEffect(() => (fn() as unknown) as void, deps);

export function useStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.log(error);
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.log(error);
    }
  };

  return [storedValue, setValue];
}

export function usePathHistory() {
  const history = useHistory();
  const params = useParams<{ path?: string }>();

  // TODO Move the '/advanced' prefix to shared code
  return {
    createHref: (path: Path) => history.createHref({ pathname: `/advanced/${path.join('.')}` }),
    push: (path: Path) => history.push(`/advanced/${path.join('.')}`),
    get path() {
      return params.path?.split('.') ?? [];
    },
  };
}

export interface UseInput {
  value: string;
  onChange: InputProps['onChange'];
  setValue: (value: string) => void;
}

export function useInput(initialValue?: string): UseInput {
  const [value, setValue] = useState<string>(initialValue ?? '');
  const onChange: InputProps['onChange'] = event => setValue(event.detail.value);
  return { value, setValue, onChange };
}

export interface UseCheckbox {
  checked: boolean;
  onChange: CheckboxProps['onChange'];
  setChecked: (value: boolean) => void;
}

export function useCheckboxInput(initialValue?: boolean): UseCheckbox {
  const [checked, setChecked] = useState<boolean>(initialValue ?? false);
  const onChange: CheckboxProps['onChange'] = event => setChecked(event.detail.checked);
  return { checked, setChecked, onChange };
}

export function useStorageInput(key: string, initialValue?: string): UseInput {
  const [value, setValue] = useStorage<string>(key, initialValue ?? '');
  const onChange: InputProps['onChange'] = event => setValue(event.detail.value);
  return { value, setValue, onChange };
}
