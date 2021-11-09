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
import React, { useEffect, useState } from 'react';
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Autosuggest, AutosuggestProps, Input, InputProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { FormFieldWrapper } from '@/components';
import { useReplacements } from '@/components/replacements-context';
import { FieldProps } from './field';
import { emptyStringAsUndefined } from '@/utils';

type StringLikeType = t.Type<any, string, any>;

const enteredTextLabel = (value: string) => value;

/**
 * This functional component renders an autosuggest field. The field allows any string input and suggests replacements.
 */
export function AutosuggestStringFormField(props: FieldProps<StringLikeType>): React.ReactElement {
  const { FieldWrapperC = FormFieldWrapper } = props;
  const [currentValue, setCurrentValue] = useState<string>();

  return (
    <FieldWrapperC {...props} overrideValue={currentValue}>
      <AutosuggestStringField {...props} onCurrentValueChange={setCurrentValue} />
    </FieldWrapperC>
  );
}

export interface AutosuggestStringProps extends FieldProps<StringLikeType> {
  onCurrentValueChange?(value: string): void;
}

/**
 * This functional component renders an autosuggest field. The field allows any string input and suggests replacements.
 */
export const AutosuggestStringField = observer(function StringField(props: AutosuggestStringProps): React.ReactElement {
  const { node, state, onCurrentValueChange } = props;
  const value = node.get(state) ?? node.metadata.defaultValue;
  const replacements = useReplacements();
  const [options, setOptions] = useState<AutosuggestProps.Option[]>([]);
  const [currentValue, setCurrentValue] = useState(emptyStringAsUndefined(value));

  // Find new suggestions while typing
  useEffect(() => {
    let newOptions: AutosuggestProps.Option[] = [];
    if (currentValue) {
      const openVarIndex = currentValue.lastIndexOf('${');
      const closeVarIndex = currentValue.lastIndexOf('}');
      // Find relevant options if the brackets are still open
      if (openVarIndex >= 0 && openVarIndex > closeVarIndex) {
        const prefix = currentValue.substr(openVarIndex + 2);

        // Find all keys with the prefix and strip the prefix from the key
        const keysWithPrefix = prefix
          ? replacements.replacements.filter(({ key }) => key.startsWith(prefix))
          : replacements.replacements;
        newOptions = keysWithPrefix.map(replacement => {
          // Remove prefix from auto complete so that we don't end up with the prefix twice
          const keyWithoutPrefix = prefix ? replacement.key.substr(prefix.length) : replacement.key;
          return {
            value: `${currentValue}${keyWithoutPrefix}}`,
            description: replacement.description,
          };
        });
      }
      onCurrentValueChange && onCurrentValueChange(currentValue);
    }
    setOptions(newOptions);
  }, [currentValue]);

  const handleChange: InputProps['onChange'] = event => {
    setCurrentValue(emptyStringAsUndefined(event.detail.value));
  };

  // Only actually set the value in state when the field is blurred
  const handleBlur = action(() => {
    node.set(state, emptyStringAsUndefined(currentValue));
  });

  // Update current value when value changes
  useEffect(() => setCurrentValue(emptyStringAsUndefined(value)), [value]);

  return (
    <Autosuggest
      enteredTextLabel={enteredTextLabel}
      value={currentValue ?? ''}
      options={options}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});

/**
 * This functional component a string field. The field allows any string input and suggests replacements.
 */
export function StringFormField(props: FieldProps<StringLikeType>): React.ReactElement {
  const { FieldWrapperC = FormFieldWrapper } = props;
  const [currentValue, setCurrentValue] = useState<string>();

  return (
    <FieldWrapperC {...props} overrideValue={currentValue}>
      <StringField {...props} onCurrentValueChange={setCurrentValue} />
    </FieldWrapperC>
  );
}

export interface StringFieldProps extends FieldProps<StringLikeType> {
  onCurrentValueChange?(value: string): void;
}

/**
 * This functional component renders an autosuggest field. The field allows any string input and suggests replacements.
 */
export const StringField = observer(function StringField(props: StringFieldProps): React.ReactElement {
  const { node, state } = props;
  const value = node.get(state) ?? node.metadata.defaultValue;
  const [currentValue, setCurrentValue] = useState(emptyStringAsUndefined(value));

  const handleChange: InputProps['onChange'] = event => {
    setCurrentValue(emptyStringAsUndefined(event.detail.value));
  };

  // Only actually set the value in state when the field is blurred
  const handleBlur = action(() => {
    node.set(state, emptyStringAsUndefined(currentValue));
  });

  // Update current value when value changes
  useEffect(() => setCurrentValue(emptyStringAsUndefined(value)), [value]);

  return <Input value={currentValue ?? ''} onChange={handleChange} onBlur={handleBlur} disabled={props.disabled} />;
});
