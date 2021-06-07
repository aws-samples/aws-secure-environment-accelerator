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
