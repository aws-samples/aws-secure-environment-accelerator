/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-template-curly-in-string */
import React, { memo, useCallback, useEffect, useState } from 'react';
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { FormField, FormFieldProps, Select, SelectProps, Toggle, ToggleProps } from '@awsui/components-react';
import { useValidation, UseValidationProps, validationAsErrorText } from '@/components/fields/validation';
import { useReplacements } from './replacements-context';
import { useI18n } from './i18n-context';

import './node-field.scss';

export type NodeFieldProps = UseValidationProps & Omit<FormFieldProps, 'label' | 'description' | 'errorText'>;

/**
 * This functional component renders a FormField with metadata from the given node. It also renders a replacement toggle to enable or disable replacement selection.
 */
export const NodeField = observer(function NodeField(props: React.PropsWithChildren<NodeFieldProps>) {
  const { node, state } = props;
  const value = node.get(state);
  const { tr } = useI18n();
  const { title, description } = tr(node);
  const [replacement, setReplacement] = useState(false);
  const validation = useValidation(props);

  const handleReplacementChange = useCallback((checked: boolean) => setReplacement(checked), []);

  useEffect(() => setReplacement(isReplacement(value)), [value]);

  return (
    <FormField
      controlId={node.path.join('.')}
      label={<NodeFieldLabel title={title} replacement={replacement} onReplacementChange={handleReplacementChange} />}
      constraintText={node.metadata.optional ? null : tr('labels.required')}
      description={description}
      errorText={validationAsErrorText(validation)}
      stretch={props.stretch}
      className={props.className}
    >
      {replacement ? <ReplacementField {...props} /> : props.children}
    </FormField>
  );
});

const ReplacementField = observer(function ReplacementField(props: UseValidationProps) {
  const { node, state } = props;
  const value = node.get(state);
  const { replacements } = useReplacements();

  const options: SelectProps.Option[] = replacements.map(replacement => ({
    value: `\${${replacement.key}}`,
    label: replacement.key,
    description: replacement.description,
  }));
  const selectedOption = options.find(option => option.value === value) ?? null;

  const handleChange: SelectProps['onChange'] = action(event => {
    node.set(state, event.detail.selectedOption?.value);
  });

  return <Select selectedOption={selectedOption} options={options} onChange={handleChange} />;
});

interface NodeFieldLabelProps {
  title?: string;
  replacement: boolean;
  onReplacementChange(checked: boolean): void;
}

const NodeFieldLabel = memo(function NodeFieldLabel({ title, replacement, onReplacementChange }: NodeFieldLabelProps) {
  const { tr } = useI18n();
  const handleReplacementChange: ToggleProps['onChange'] = e => onReplacementChange(e.detail.checked);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{title}</span>
      <div style={{ display: 'flex' }}>
        <span>{tr('labels.toggle_replacement')}</span>
        <Toggle
          checked={replacement}
          onChange={handleReplacementChange}
          ariaLabel={tr('labels.toggle_replacement')}
          className="replacement-toggle"
        />
      </div>
    </div>
  );
});

function isReplacement(value: any) {
  return typeof value === 'string' && value.startsWith('${') && value.endsWith('}');
}
