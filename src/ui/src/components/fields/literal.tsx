/* eslint-disable @typescript-eslint/no-explicit-any */
import { Input } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { FormFieldWrapper } from '@/components/node-field';
import { FieldProps } from './field';

/**
 * This functional component renders a literal value as a disabled input field.
 */
export function LiteralFormField(props: FieldProps<t.LiteralType<any>>) {
  const { node, FieldWrapperC = FormFieldWrapper } = props;
  return (
    <FieldWrapperC {...props}>
      <Input value={node.rawType.value} disabled />
    </FieldWrapperC>
  );
}
