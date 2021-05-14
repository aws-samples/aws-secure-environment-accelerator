/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from '@aws-accelerator/common-types';
import { NodeEditLink } from '@/components/node-edit-link';
import { NodeField } from '@/components/node-field';
import { FieldProps } from './field';

/**
 * This functional component renders an "Edit" button that navigates to the given node's path.
 */
export const LinkField = (props: FieldProps<t.Any>) => {
  const { node } = props;

  return (
    <NodeField {...props} validation={false} stretch>
      <NodeEditLink path={node.path} />
    </NodeField>
  );
};
