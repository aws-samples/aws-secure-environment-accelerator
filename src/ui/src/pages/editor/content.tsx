/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { CodeEditor, CodeEditorProps, SpaceBetween } from '@awsui/components-react';

export interface ContentProps {
  value: string;
  setValue(value: string): void;
}

export default observer(function Content(props: ContentProps) {
  const [preferences, setPreferences] = useState<CodeEditorProps.Preferences | undefined>(undefined);
  const [ace, setAce] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);

  const handleChange: CodeEditorProps['onChange'] = e => props.setValue(e.detail.value);
  const handlePreferenceChange: CodeEditorProps['onPreferencesChange'] = e => setPreferences(e.detail);

  // Load the ace library
  useEffect(() => {
    import('ace-builds')
      .then(({ default: _ace }) => {
        import('ace-builds/webpack-resolver')
          .then(() => {
            setAce(_ace);
            setLoading(false);
          })
          .catch(() => setLoading(false));
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <SpaceBetween direction="vertical" size="s">
      <CodeEditor
        ace={ace}
        language="json"
        value={props.value}
        loading={loading}
        preferences={preferences}
        onChange={handleChange}
        onPreferencesChange={handlePreferenceChange}
        i18nStrings={{
          loadingState: 'Loading code editor...',
          errorState: 'There was an error loading the code editor.',
          errorStateRecovery: 'Retry',
          editorGroupAriaLabel: 'Code editor',
          statusBarGroupAriaLabel: 'Status bar',
          cursorPosition: (row, column) => `Ln ${row}, Col ${column}`,
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
        }}
      />
    </SpaceBetween>
  );
});
