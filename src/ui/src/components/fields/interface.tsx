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
import { Box, SpaceBetween, SpaceBetweenProps } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { Field, FieldProps } from './field';

export interface InterfaceFormFieldProps<T extends t.InterfaceType<any> = t.InterfaceType<any>> extends FieldProps<T> {
  /**
   * @default 'm'
   */
  spaceBetween?: SpaceBetweenProps['size'];
  /**
   * @default true
   */
  divider?: boolean;
  hiddenFields?: string[];
}

/**
 * This functional component renders all the properties of an InterfaceType.
 */
export const InterfaceFormField = function <T extends t.InterfaceType<any>>(props: InterfaceFormFieldProps<T>) {
  const { divider = true, hiddenFields, node, state, spaceBetween = 'm', FieldC = Field } = props;
  const properties = node.rawType.props;
  const fields = Object.keys(properties)
    .filter(key => !hiddenFields?.includes(key) ?? true)
    .map((key, index) => {
      const propertyNode = node.nested(key);
      return (
        <React.Fragment key={key}>
          {divider && index > 0 ? <Box className="divider" /> : null}
          <FieldC
            state={state}
            node={propertyNode}
            context={props.context}
            FieldC={props.FieldC}
            FieldWrapperC={props.FieldWrapperC}
          />
        </React.Fragment>
      );
    });
  return <SpaceBetween size={spaceBetween}>{fields}</SpaceBetween>;
};
