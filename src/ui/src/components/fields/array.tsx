/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { action, observable } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Box, Button, Icon, SpaceBetween } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { NodeField } from '@/components/node-field';
import { toArray } from '@/utils/cast';
import { FieldProps, getFieldRenderer } from './field';

import './array.scss';

/**
 * This functional component renders an "Add" button and all the values in the array and their corresponding "Remove" buttons.
 */
export function ArrayField(props: FieldProps<t.ArrayType<t.Any>>) {
  const { node, state } = props;

  const handleAdd = action(() => {
    const value = node.get(state);
    const newValue = value ? [...value, undefined] : [undefined];
    node.set(state, observable(newValue));
  });

  return (
    <NodeField {...props} validation={false} stretch>
      <SpaceBetween direction="vertical" size="s">
        <Button onClick={handleAdd}>
          <Icon name="add-plus" /> Add
        </Button>
        <ArrayFields {...props} />
      </SpaceBetween>
    </NodeField>
  );
}

/**
 * This functional components renders all the values in the array and their corresponding "Remove" buttons.
 *
 * This component observes the state and will re-render when the array's values change.
 */
const ArrayFields = observer(function ArrayFields(props: FieldProps<t.ArrayType<t.Any>>) {
  const { node, state } = props;

  // Find the renderer for the elements of the array
  const ElementRenderer = getFieldRenderer(node.rawType);

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
        {index > 0 ? <Box className="divider" /> : null}
        <SpaceBetween direction="vertical" size="s" className="indented">
          <ElementRenderer state={state} node={elementNode} />
          <Button onClick={handleRemoveFn(index)}>Remove</Button>
        </SpaceBetween>
      </React.Fragment>
    );
  });
  return (
    <SpaceBetween direction="vertical" size="m">
      {fields}
    </SpaceBetween>
  );
});
