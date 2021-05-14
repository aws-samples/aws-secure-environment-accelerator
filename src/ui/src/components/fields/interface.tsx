/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Box, SpaceBetween } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { Field, FieldProps } from './field';

/**
 * This functional component renders all the properties of an InterfaceType.
 */
export const InterfaceField = function <T extends t.InterfaceType<any>>(props: FieldProps<T>) {
  const { node, state } = props;
  const properties = node.rawType.props;
  const fields = Object.keys(properties).map((key, index) => {
    const propertyNode = node.nested(key);
    return (
      <React.Fragment key={key}>
        {index > 0 ? <Box className="divider" /> : null}
        <Field state={state} node={propertyNode} />
      </React.Fragment>
    );
  });
  return <SpaceBetween size="l">{fields}</SpaceBetween>;
};
