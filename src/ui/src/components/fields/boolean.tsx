/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Checkbox, CheckboxProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { NodeField } from '@/components';
import { FieldProps } from './field';

/**
 * This functional component renders a checkbox.
 */
export const BooleanField = observer(function BooleanField(props: FieldProps<t.BooleanType>) {
  const { node, state } = props;
  const value = node.get(state) ?? node.metadata.defaultValue;

  const handleChange: CheckboxProps['onChange'] = action(event => {
    props.node.set(state, event.detail.checked);
  });

  return (
    <NodeField {...props} overrideValue={value} stretch>
      <Checkbox checked={value} onChange={handleChange} />
    </NodeField>
  );
});
