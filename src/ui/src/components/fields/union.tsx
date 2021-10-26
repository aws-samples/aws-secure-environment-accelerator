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

import React, { useEffect } from 'react';
import { Select, SelectProps, SpaceBetween } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { FormFieldWrapper } from '@/components';
import { useI18n } from '@/components/i18n-context';
import { useStorage } from '@/utils/hooks';
import { Field, FieldProps } from './field';

interface UnionOption extends SelectProps.Option {
  index?: number;
}

/**
 * This functional component renders a dropdown with the possible values of the UnionType and renders the field for the selected union type.
 */
export function UnionFormField(props: FieldProps<t.UnionType<t.Any[]>>): React.ReactElement {
  const { node, state, FieldC = Field, FieldWrapperC = FormFieldWrapper } = props;
  const { metadata } = node;
  const { tr } = useI18n();

  // Keep track of the last selected union type index.
  const [typeIndex, setTypeIndex] = useStorage<number | undefined>('advanced.' + node.path.join('.'), undefined);

  // Try to restore the exact subtype of the union type from the state value
  useEffect(() => {
    const subtypes = node.rawType.types;
    const value = node.get(state);
    for (let index = 0; index < subtypes.length; index++) {
      const subtype = subtypes[index];
      if (subtype.is(value)) {
        setTypeIndex(index);
        break;
      }
    }
  }, []);

  // Create a dropdown option for each union type
  const options: UnionOption[] = node.rawType.types.map((subtype, index) => {
    const subnode = node.nested(index);
    const translations = tr(subnode);
    return {
      label: translations.title,
      description: translations.description,
      index,
    };
  });

  // Add the option to select an "empty" undefined value if the field is optional
  if (metadata.optional) {
    options.unshift({
      label: tr('labels.empty'),
    });
  }

  const selectedOption = typeof typeIndex === 'number' ? options[typeIndex] : null;
  const selectedNode = typeof typeIndex === 'number' ? node.nested(typeIndex) : undefined;

  const handleChange: SelectProps['onChange'] = event => {
    const { index } = event.detail.selectedOption as UnionOption;
    setTypeIndex(index);
  };

  return (
    <FieldWrapperC {...props} validation={false}>
      <SpaceBetween direction="vertical" size="s">
        <Select selectedOption={selectedOption} options={options} onChange={handleChange} />
        {selectedNode ? (
          <FieldC
            state={state}
            node={selectedNode}
            context={props.context}
            FieldC={props.FieldC}
            FieldWrapperC={props.FieldWrapperC}
          />
        ) : null}
      </SpaceBetween>
    </FieldWrapperC>
  );
}
