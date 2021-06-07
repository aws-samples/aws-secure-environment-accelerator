/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import * as t from '@aws-accelerator/common-types';
import { FieldProps } from './field';
import { AutosuggestStringFormField } from './string';

/**
 * This functional component renders a string field. This component can be adjusted in the future to allow CIDR range input.
 */
export function CidrFormField(props: FieldProps<t.CidrType>): React.ReactElement {
  return <AutosuggestStringFormField {...props} />;
}
