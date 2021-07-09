/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { CodeEditor, CodeEditorProps } from '@awsui/components-react';

// See https://github.com/ajaxorg/ace-builds/issues/129#issuecomment-619524731
import { default as ace } from 'ace-builds';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-yaml';

export interface AceCodeEditorProps {
  value: string;
  language: CodeEditorProps['language'];
  i18nStrings?: CodeEditorProps['i18nStrings'];
  onChange?(value: string): void;
}

const defaultI18nStrings = {
  loadingState: 'Loading code editor...',
  errorState: 'There was an error loading the code editor.',
  errorStateRecovery: 'Retry',
  editorGroupAriaLabel: 'Code editor',
  statusBarGroupAriaLabel: 'Status bar',
  cursorPosition: (row: number, column: number) => `Ln ${row}, Col ${column}`,
  errorsTab: 'Errors',
  warningsTab: 'Warnings',
  preferencesButtonAriaLabel: 'Preferences',
  paneCloseButtonAriaLabel: 'Close',
  preferencesModalHeader: 'Preferences',
  preferencesModalCancel: 'Cancel',
  preferencesModalConfirm: 'Confirm',
  preferencesModalWrapLines: 'Wrap lines',
  preferencesModalTheme: 'Theme',
  preferencesModalLightThemes: 'Light themes',
  preferencesModalDarkThemes: 'Dark themes',
};

export function AceCodeEditor(props: AceCodeEditorProps) {
  const [preferences, setPreferences] = useState<CodeEditorProps.Preferences | undefined>(undefined);

  const handleChange: CodeEditorProps['onChange'] = e => props.onChange && props.onChange(e.detail.value);
  const handlePreferenceChange: CodeEditorProps['onPreferencesChange'] = e => setPreferences(e.detail);

  return (
    <CodeEditor
      ace={ace}
      language={props.language}
      value={props.value}
      loading={false}
      preferences={preferences}
      onChange={handleChange}
      onPreferencesChange={handlePreferenceChange}
      i18nStrings={props.i18nStrings ?? defaultI18nStrings}
    />
  );
}
