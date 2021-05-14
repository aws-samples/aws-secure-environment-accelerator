import { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { InputProps } from '@awsui/components-react';
import { Path } from '@/components/fields';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
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
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
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

export type UseInput = Pick<InputProps, 'value' | 'onChange'>;

export function useInput(initialValue?: string): UseInput {
  const [value, setValue] = useState<string>(initialValue ?? '');
  const onChange: InputProps['onChange'] = event => setValue(event.detail.value);
  return { value, onChange };
}

export function useLocalStorageInput(key: string, initialValue?: string): UseInput {
  const [value, setValue] = useLocalStorage<string>(key, initialValue ?? '');
  const onChange: InputProps['onChange'] = event => setValue(event.detail.value);
  return { value, onChange };
}
