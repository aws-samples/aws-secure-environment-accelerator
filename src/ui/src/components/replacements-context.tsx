/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { createContext, FC, useContext, useEffect, useState } from 'react';
import * as c from '@aws-accelerator/config';
import * as t from '@aws-accelerator/common-types';
import { useAcceleratorConfig } from './accelerator-config-context';

interface Replacements {
  readonly replacements: readonly Replacement[];
  replaceInString(value: string): string;
  replaceInObject(value: any): any;
}

interface Replacement {
  readonly key: string;
  readonly search: RegExp;
  readonly value: string;
  readonly description?: string;
}

const ReplacementsC = createContext<Replacements | undefined>(undefined);

export function useReplacements(): Replacements {
  return useContext(ReplacementsC)!;
}

export const ReplacementsContext: FC = observer(function ReplacementsContext({ children }) {
  const acceleratorConfiguration = useAcceleratorConfig();
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const configReplacements = acceleratorConfiguration.replacements;

  useEffect(() => {
    // Combine default replacements and replacements from configuration
    setReplacements([...createDefaultReplacements(), ...createReplacementsFromConfig(configReplacements)]);
  }, [configReplacements]);

  const replaceInString = (value: string) =>
    replacements.reduce((current, replacement) => current.replace(replacement.search, replacement.value), value);

  const replaceInObject = (value: any) => {
    if (value != null) {
      const stringified = JSON.stringify(value);
      // TODO Make this more efficient
      try {
        const replaced = replaceInString(stringified);
        return JSON.parse(replaced);
      } catch (e) {
        console.log(stringified);
        console.warn(e);
      }
    }
    return value;
  };

  const value = {
    replacements,
    replaceInString,
    replaceInObject,
  };

  return <ReplacementsC.Provider value={value}>{children}</ReplacementsC.Provider>;
});

/**
 * Create replacements from replacement object in Accelerator configuration.
 */
function createReplacementsFromConfig(configReplacements: any): Replacement[] {
  return Object.entries(configReplacements ?? {}).flatMap(([key, value]): Replacement[] => {
    if (t.string.is(value) || c.ReplacementStringArray.is(value)) {
      return [createReplacement(key, value)];
    } else if (c.ReplacementObject.is(value)) {
      return Object.entries(value).map(([needle, replacement]) => createReplacement(key + '_' + needle, replacement));
    }
    console.warn(`Unsupported config replacement ${value}`);
    return [];
  });
}

const defaultReplacements: readonly Replacement[] = [
  {
    key: 'HOME_REGION',
    dummyValue: 'us-east-1',
    description: 'The region where the Accelerator is deployed.',
  },
  {
    key: 'GBL_REGION',
    dummyValue: 'us-east-1',
    description: 'The global region.',
  },
  {
    key: 'ACCELERATOR_NAME',
    dummyValue: 'Accelerator',
    description: 'The Accelerator name.',
  },
  {
    key: 'ACCELERATOR_PREFIX',
    dummyValue: 'Accel-',
    description: 'The Accelerator prefix.',
  },
  {
    key: 'ACCELERATOR_PREFIX_ND',
    dummyValue: 'Accel',
    description: 'The Accelerator prefix with trailing dash.',
  },
  {
    key: 'ACCELERATOR_PREFIX_LND',
    dummyValue: 'accel',
    description: 'The Accelerator prefix in lowercase with trailing dash.',
  },
  {
    key: 'ORG_ADMIN_ROLE',
    dummyValue: 'Admin',
    description: 'The organization administrator IAM role.',
  },
].map(({ key, dummyValue, description }) => createReplacement(key, dummyValue, description));

function createDefaultReplacements() {
  return defaultReplacements;
}

/**
 * Create a replacement for the given key and replacement value.
 */
function createReplacement(key: string, replacement: string | string[], description?: string): Replacement {
  if (typeof replacement === 'string') {
    return {
      key,
      search: new RegExp('\\${' + key + '}', 'gi'),
      value: replacement,
      description,
    };
  } else {
    return {
      key,
      search: new RegExp('"?\\${' + key + '}"?', 'gi'),
      value: JSON.stringify(replacement),
      description,
    };
  }
}
