/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Input, InputProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { NodeField } from '@/components';
import { FieldProps } from './field';

/**
 * This functional component renders a number input field.
 */
export const NumberField = observer((props: FieldProps<t.NumberType>) => {
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

  return (
    <NodeField {...props} overrideValue={value} stretch>
      <Input value={`${value}`} onChange={handleChange} type="number" />
    </NodeField>
  );
});
