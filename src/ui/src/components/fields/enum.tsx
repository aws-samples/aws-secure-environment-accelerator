/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Select, SelectProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { FormFieldWrapper } from '@/components';
import { FieldProps } from './field';
import { useI18n } from '../i18n-context';

export interface EnumFieldProps extends FieldProps<t.EnumType<any>> {}

/**
 * This functional component renders a dropdown with all enumeration values.
 */
export function EnumFormField(props: FieldProps<t.EnumType<any>>) {
  const { FieldWrapperC = FormFieldWrapper } = props;
  return (
    <FieldWrapperC {...props}>
      <EnumField {...props} />
    </FieldWrapperC>
  );
}

/**
 * This functional component renders a dropdown with all enumeration values.
 */
export const EnumField = observer(function EnumField(props: EnumFieldProps) {
  const { tr } = useI18n();
  const { node, state, disabled } = props;
  const { metadata } = node;
  const value = node.get(state) ?? metadata.defaultValue;

  const options: SelectProps.Option[] = node.rawType.values.map(enumValue => ({
    label: metadata?.enumLabels?.[enumValue] ?? enumValue,
    value: enumValue,
  }));

  // Add the option to select an "empty" undefined value if the field is optional
  if (metadata.optional) {
    options.unshift({
      label: tr('labels.empty'),
      value: undefined,
    });
  }

  // The selection option is the option with the same value as the state's value
  const selectedOption = options?.find(option => option.value === value) ?? null;

  const handleChange: SelectProps['onChange'] = action(event => {
    node.set(state, event.detail.selectedOption.value);
  });

  return <Select selectedOption={selectedOption} options={options} onChange={handleChange} disabled={disabled} />;
});
