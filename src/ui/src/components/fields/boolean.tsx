/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import * as t from '@aws-accelerator/common-types';
import { Checkbox, CheckboxProps } from '@awsui/components-react';
import { FormFieldWrapper } from '@/components';
import { FieldProps } from './field';
import { useStateInput } from './input';

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
  const { value: checked, onChange } = useStateInput<CheckboxProps.ChangeDetail, boolean>({
    node: props.node,
    state: props.state,
    mapDetailToValue: detail => detail.checked,
  });
  return <Checkbox checked={checked} onChange={onChange} disabled={props.disabled} />;
});
