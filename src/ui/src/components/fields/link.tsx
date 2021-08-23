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
