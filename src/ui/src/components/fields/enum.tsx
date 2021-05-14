/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Select, SelectProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { NodeField } from '@/components';
import { FieldProps } from './field';

/**
 * This functional component renders a dropdown with all enumeration values.
 */
export const EnumField = observer(function EnumField(props: FieldProps<t.EnumType<any>>) {
  const { node, state } = props;
  const { metadata } = node;
  const value = node.get(state) ?? metadata.defaultValue;

  const options: SelectProps.Option[] = node.rawType.values.map(enumValue => ({
    label: metadata?.enumLabels?.[enumValue] ?? enumValue,
    value: enumValue,
  }));

  // Add the option to select an "empty" undefined value if the field is optional
  if (metadata.optional) {
    options.unshift({
      label: '<empty>',
      value: undefined,
    });
  }

  // The selection option is the option with the same value as the state's value
  const selectedOption = options?.find(option => option.value === value) ?? null;

  const handleChange: SelectProps['onChange'] = action(event => {
    node.set(state, event.detail.selectedOption.value);
  });

  return (
    <NodeField {...props} stretch>
      <Select selectedOption={selectedOption} options={options} onChange={handleChange} />
    </NodeField>
  );
});
