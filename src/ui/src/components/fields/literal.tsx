/* eslint-disable @typescript-eslint/no-explicit-any */
import { Input } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { NodeField } from '@/components/node-field';
import { FieldProps } from './field';

/**
 * This functional component renders a literal value as a disabled input field.
 */
export function LiteralField(props: FieldProps<t.LiteralType<any>>) {
  const { node } = props;

  return (
    <NodeField {...props} stretch>
      <Input value={node.rawType.value} disabled />
    </NodeField>
  );
}
