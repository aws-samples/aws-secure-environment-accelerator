/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Autosuggest, AutosuggestProps, InputProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { NodeField } from '@/components';
import { useReplacements } from '@/components/replacements-context';
import { FieldProps } from './field';

type StringLikeType = t.Type<any, string, any>;

const enteredTextLabel = (value: string) => value;

/**
 * This functional component renders an autosuggest field. The field allows any string input and suggests replacements.
 */
export const StringField = observer(function StringField(props: FieldProps<StringLikeType>): React.ReactElement {
  const { node, state } = props;
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

  return (
    <NodeField {...props} overrideValue={currentValue} stretch>
      <Autosuggest
        enteredTextLabel={enteredTextLabel}
        value={currentValue ?? ''}
        options={options}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </NodeField>
  );
});

/**
 * Returns the given value if the value is a string and if it is not empty. Return undefined otherwise.
 */
function emptyStringAsUndefined(value: any): string | undefined {
  if (typeof value === 'string' && /\S/.test(value)) {
    return value;
  }
  return undefined;
}
