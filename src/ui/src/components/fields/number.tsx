/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Input, InputProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { FormFieldWrapper } from '@/components';
import { FieldProps } from './field';

/**
 * This functional component renders a number input field.
 */
export function NumberFormField(props: FieldProps<t.NumberType>) {
  const { FieldWrapperC = FormFieldWrapper } = props;
  return (
    <FieldWrapperC {...props}>
      <NumberField {...props} />
    </FieldWrapperC>
  );
}

export interface NumberFieldProps extends FieldProps<t.NumberType> {}

export const NumberField = observer((props: NumberFieldProps) => {
  const { node, state } = props;
  const value = node.get(state) ?? node.metadata.defaultValue;

  const handleChange: InputProps['onChange'] = action(event => {
    try {
      const numberValue = +event.detail.value;
      node.set(state, numberValue);
    } catch (e) {
      console.warn(e);
    }
  });

  return <Input value={`${value}`} onChange={handleChange} type="number" disabled={props.disabled} />;
});
