/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import * as t from '@aws-accelerator/common-types';
import { Checkbox, CheckboxProps } from '@awsui/components-react';
import { FormFieldWrapper } from '@/components';
import { FieldProps } from './field';

/**
 * This functional component renders a checkbox.
 */
export function BooleanFormField(props: FieldProps<t.BooleanType>) {
  const { FieldWrapperC = FormFieldWrapper } = props;
  return (
    <FieldWrapperC {...props}>
      <BooleanField {...props} />
    </FieldWrapperC>
  );
}

export interface BooleanFieldProps extends FieldProps<t.BooleanType> {}

export const BooleanField = observer(function BooleanField(props: BooleanFieldProps) {
  const { node, state } = props;
  const value = node.get(state) ?? node.metadata.defaultValue;

  const handleChange: CheckboxProps['onChange'] = action(event => {
    node.set(state, event.detail.checked);
  });

  return <Checkbox checked={value} onChange={handleChange} disabled={props.disabled} />;
});
