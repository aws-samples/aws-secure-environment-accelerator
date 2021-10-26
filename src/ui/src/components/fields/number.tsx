/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

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
