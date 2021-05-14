/* eslint-disable @typescript-eslint/no-explicit-any */
import { CodeCommitClient, GetBranchCommand, PutFileCommand } from '@aws-sdk/client-codecommit';
import { action, set } from 'mobx';
import React, { useCallback, useState } from 'react';
import { useAcceleratorConfig } from '@/components/accelerator-config-context';
import { ImportModal } from '@/components/import-modal';
import { ExportModal, ExportModalCodeCommitSubmit, ExportModalSubmit } from '@/components/export-modal';
import { useAwsConfiguration } from './aws-credentials-context';

interface UiContext {
  setImportDialogVisible(visible: boolean): void;
  setExportDialogVisible(visible: boolean): void;
}

const UiC = React.createContext<UiContext | undefined>(undefined);

/**
 * Context provider that allows sub-components to show import and export modals.
 */
export const UiProvider: React.FC = ({ children }) => {
  const state = useAcceleratorConfig();
  const { configuration: awsConfiguration } = useAwsConfiguration();
  const [importVisible, setImportDialogVisible] = useState(false);
  const [exportVisible, setExportDialogVisibleReal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportErrorMessage, setExportErrorMessage] = useState<string | undefined>();

  const setExportDialogVisible = useCallback((visible: boolean) => {
    setExportLoading(false);
    setExportErrorMessage(undefined);
    setExportDialogVisibleReal(true);
  }, []);

  const handleExportDismiss = useCallback(() => {
    setExportDialogVisibleReal(false);
  }, []);

  const handleImportDismiss = useCallback(() => {
    setImportDialogVisible(false);
  }, []);

  const handleImport = action((value: any) => {
    set(state, value);
    setImportDialogVisible(false);
  });

  /*
   * Handle submit when file tab is selected.
   */
  const handleFileSubmit = useCallback((configuration: any) => {
    const file = new Blob([JSON.stringify(configuration, null, 2)], { type: 'application/json' });

    const element = document.createElement('a');
    element.href = URL.createObjectURL(file);
    element.download = 'config.json';
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();

    setExportDialogVisible(false);
  }, []);

  /*
   * Handle submit when CodeCommit tab is selected.
   */
  const handleCodeCommitSubmit = useCallback(
    (submit: ExportModalCodeCommitSubmit) => {
      setExportLoading(true);

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      (async () => {
        try {
          const encoder = new TextEncoder();
          const content = encoder.encode(JSON.stringify(submit.configuration, null, 2));

          const client = new CodeCommitClient(awsConfiguration);
          const { branch } = await client.send(
            new GetBranchCommand({
              repositoryName: submit.repositoryName,
              branchName: submit.branchName,
            }),
          );
          const { commitId } = await client.send(
            new PutFileCommand({
              repositoryName: submit.repositoryName,
              filePath: submit.filePath,
              branchName: submit.branchName,
              parentCommitId: branch?.commitId,
              fileContent: content,
            }),
          );
        } catch (e) {
          console.error(e);
          setExportErrorMessage(`${e}`);
        } finally {
          setExportLoading(false);
          setExportDialogVisibleReal(false);
        }
      })();
    },
    [awsConfiguration],
  );

  const handleSubmit = useCallback(
    (submit: ExportModalSubmit) => {
      if (submit.type === 'file') {
        handleFileSubmit(submit.configuration);
      } else {
        handleCodeCommitSubmit(submit);
      }
    },
    [handleFileSubmit, handleCodeCommitSubmit],
  );

  return (
    <UiC.Provider value={{ setImportDialogVisible, setExportDialogVisible }}>
      {children}
      <ImportModal visible={importVisible} onDismiss={handleImportDismiss} onSubmit={handleImport} />
      <ExportModal
        state={state}
        visible={exportVisible}
        loading={exportLoading}
        errorMessage={exportErrorMessage}
        onDismiss={handleExportDismiss}
        onSubmit={handleSubmit}
      />
    </UiC.Provider>
  );
};

export function useUi() {
  return React.useContext(UiC)!;
}
