/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from '@aws-accelerator/common-types';
import { NodeEditLink } from '@/components/node-edit-link';
import { FormFieldWrapper } from '@/components/node-field';
import { FieldProps } from './field';

/**
 * This functional component renders an "Edit" button that navigates to the given node's path.
 */
export const LinkFormField = (props: FieldProps<t.Any>) => {
  const { node, FieldWrapperC = FormFieldWrapper } = props;
  return (
    <FieldWrapperC {...props} validation={false}>
      <NodeEditLink path={node.path} />
    </FieldWrapperC>
  );
};
