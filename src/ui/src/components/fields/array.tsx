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
import React from 'react';
import { action, observable } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Box, Button, SpaceBetween, SpaceBetweenProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { FormFieldWrapper } from '@/components/node-field';
import { useI18n } from '@/components/i18n-context';
import { Indent } from '@/components/indent';
import { toArray } from '@/utils/cast';
import { Field, FieldProps } from './field';

export interface ArrayFormFieldProps<T extends t.ArrayType<t.Any> = t.ArrayType<t.Any>> extends FieldProps<T> {
  /**
   * @default 'm'
   */
  spaceBetween?: SpaceBetweenProps['size'];
  /**
   * @default true
   */
  divider?: boolean;
}

/**
 * This functional component renders an "Add" button and all the values in the array and their corresponding "Remove" buttons.
 */
export function ArrayFormField<T extends t.ArrayType<t.Any>>(props: ArrayFormFieldProps<T>) {
  const { FieldWrapperC = FormFieldWrapper } = props;

  return (
    <FieldWrapperC {...props} validation={false}>
      <ArrayField {...props} />
    </FieldWrapperC>
  );
}

/**
 * This functional component renders an "Add" button and all the values in the array and their corresponding "Remove" buttons.
 */
export function ArrayField<T extends t.ArrayType<t.Any>>(props: ArrayFormFieldProps<T>) {
  const { disabled = false, node, state } = props;
  const { tr } = useI18n();
  const { title } = tr(node);

  const handleAdd = action(() => {
    const value = node.get(state);
    const newValue = value ? [...value, undefined] : [undefined];
    node.set(state, observable(newValue));
  });

  return (
    <SpaceBetween direction="vertical" size="s">
      {!disabled && (
        <Button onClick={handleAdd} iconName="add-plus" formAction="none">
          {tr('buttons.add', { title })}
        </Button>
      )}
      <ArrayFields {...props} />
    </SpaceBetween>
  );
}

/**
 * This functional components renders all the values in the array and their corresponding "Remove" buttons.
 *
 * This component observes the state and will re-render when the array's values change.
 */
const ArrayFields = observer(function ArrayFields<T extends t.ArrayType<t.Any>>(props: ArrayFormFieldProps<T>) {
  const { disabled = false, divider = true, node, state, spaceBetween = 's', FieldC = Field } = props;
  const { tr } = useI18n();
  const { title } = tr(node);

  const handleRemoveFn = (index: number) =>
    action(() => {
      const currentValue = toArray(node.get(state));
      const newValue = [...currentValue];
      newValue.splice(index, 1);
      node.set(state, observable(newValue));
    });

  // Extract the value of the state and cast the value to an array.
  const value = toArray(node.get(state));

  // Render the correct field for every value.
  const fields = value.map((_: unknown, index: number) => {
    const elementNode = node.nested(index);
    return (
      <React.Fragment key={index}>
        {divider && index > 0 ? <Box className="divider" /> : null}
        <Indent>
          <SpaceBetween direction="vertical" size="s">
            <FieldC
              state={state}
              node={elementNode}
              context={props.context}
              FieldC={props.FieldC}
              FieldWrapperC={props.FieldWrapperC}
            />
            {!disabled && (
              <Button onClick={handleRemoveFn(index)} iconName="close" formAction="none">
                {tr('buttons.remove', { title })}
              </Button>
            )}
          </SpaceBetween>
        </Indent>
      </React.Fragment>
    );
  });

  return (
    <SpaceBetween direction="vertical" size={spaceBetween}>
      {fields}
    </SpaceBetween>
  );
});
