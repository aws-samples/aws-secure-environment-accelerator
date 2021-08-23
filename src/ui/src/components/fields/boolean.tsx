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
