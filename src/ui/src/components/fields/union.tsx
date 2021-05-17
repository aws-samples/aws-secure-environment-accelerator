import React, { useEffect } from 'react';
import { Select, SelectProps, SpaceBetween, FormField } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { NodeField } from '@/components';
import { useI18n } from '@/components/i18n-context';
import { useLocalStorage } from '@/utils/hooks';
import { Field, FieldProps } from './field';

interface UnionOption extends SelectProps.Option {
  index?: number;
}

/**
 * This functional component renders a dropdown with the possible values of the UnionType and renders the field for the selected union type.
 */
export function UnionField(props: FieldProps<t.UnionType<t.Any[]>>): React.ReactElement {
  const { node, state } = props;
  const { metadata } = node;
  const { tr } = useI18n();

  // Keep track of the last selected union type index.
  const [typeIndex, setTypeIndex] = useLocalStorage<number | undefined>('advanced.' + node.path.join('.'), undefined);

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
    <NodeField {...props} validation={false} stretch>
      <SpaceBetween direction="vertical" size="s">
        <Select selectedOption={selectedOption} options={options} onChange={handleChange} />
        {selectedNode ? <Field state={state} node={selectedNode} /> : null}
      </SpaceBetween>
    </NodeField>
  );
}
