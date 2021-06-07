/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-template-curly-in-string */
import { memo, useCallback, useEffect, useState } from 'react';
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Box, FormField, Select, SelectProps, Toggle, ToggleProps } from '@awsui/components-react';
import { useValidation, UseValidationProps, validationAsErrorText } from '@/components/fields/validation';
import { FieldWrapperProps } from './fields/field';
import { useReplacements } from './replacements-context';
import { useI18n } from './i18n-context';

import './node-field.scss';

/**
 * This functional component renders a FormField with metadata from the given node. It also renders a replacement toggle to enable or disable replacement selection.
 */
export const FormFieldWrapper = observer(function FormFieldWrapper(props: FieldWrapperProps) {
  const { node, state } = props;
  const value = node.get(state);
  const { tr } = useI18n();
  const { title, description } = tr(node);
  const [replacement, setReplacement] = useState(false);
  const validation = useValidation(props);

  const handleReplacementChange = useCallback((checked: boolean) => setReplacement(checked), []);

  useEffect(() => setReplacement(isReplacement(value)), [value]);

  const label = (
    <FormFieldWrapperLabel title={title} replacement={replacement} onReplacementChange={handleReplacementChange} />
  );

  return (
    <FormField
      controlId={node.path.join('.')}
      label={label}
      constraintText={node.metadata.optional ? null : tr('labels.required')}
      description={description}
      errorText={validationAsErrorText(validation)}
      stretch={true}
      className={props.className}
    >
      {replacement ? <ReplacementField {...props} /> : props.children}
    </FormField>
  );
});

/**
 * This functional component renders a FormField with metadata from the given node. It also renders a replacement toggle to enable or disable replacement selection.
 */
export function SimpleFormFieldWrapper(props: FieldWrapperProps) {
  const { context, node } = props;
  const { tr } = useI18n();
  const translations = tr(node);
  const validation = useValidation(props);

  return (
    <FormField
      controlId={node.path.join('.')}
      label={context?.label ?? translations.title}
      description={context?.description ?? translations.description}
      constraintText={node.metadata.optional ? null : tr('labels.required')}
      errorText={validationAsErrorText(validation)}
      stretch={true}
      className={props.className}
    >
      {props.children}
    </FormField>
  );
}

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

interface FormFieldWrapperLabelProps {
  title?: string;
  replacement: boolean;
  onReplacementChange(checked: boolean): void;
}

const FormFieldWrapperLabel = memo(function FormFieldWrapperLabel({
  title,
  replacement,
  onReplacementChange,
}: FormFieldWrapperLabelProps) {
  const { tr } = useI18n();
  const handleReplacementChange: ToggleProps['onChange'] = e => onReplacementChange(e.detail.checked);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Box variant="span">{title}</Box>
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
