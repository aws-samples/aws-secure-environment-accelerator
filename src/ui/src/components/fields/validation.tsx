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
import { useEffect, useState } from 'react';
import * as t from '@aws-accelerator/common-types';
import { useReplacements } from '@/components/replacements-context';
import { FieldProps } from './field';

export type Validation = ReturnType<t.Any['validate']> | undefined;

export interface UseValidationProps<T extends t.Any = t.Any> extends FieldProps<T> {
  /**
   * Run validation for this value instead of the value in the state of the FieldProps.
   */
  overrideValue?: t.TypeOf<T>;
  /**
   * Enable validation or not.
   * @default true
   */
  validation?: boolean;
}

/**
 * React hook that runs validation for the given FieldProps.
 */
export function useValidation<T extends t.Any>(props: UseValidationProps<T>): Validation {
  const { node, state, validation = true } = props;
  const value = props.overrideValue ?? node.get(state);
  const [result, setResult] = useState<Validation>();
  const { replaceInObject } = useReplacements();

  useEffect(() => {
    if (validation) {
      const replaced = replaceInObject(value);
      const result = node.type.validate(replaced, []);
      setResult(result);
    } else {
      setResult(undefined);
    }
  }, [value, validation]);

  return result;
}

export function validationAsErrorText(validation: Validation): React.ReactElement | null {
  if (validation?._tag === 'Left') {
    const messages = validation.left.map(v => v.message).filter((m): m is string => !!m);
    if (messages.length === 0) {
      return <span>Value should be set.</span>;
    }
    return <span>{messages[0]}</span>;
  }
  return null;
}
