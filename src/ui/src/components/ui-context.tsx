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
import { action, set } from 'mobx';
import React, { useCallback, useState } from 'react';
import { useObservable } from '@/components/accelerator-config-context';
import { ImportModal } from '@/components/import-modal';
import { ExportModal, useHandleExportSubmit } from '@/components/export-modal';

interface UiContext {
  setImportDialogVisible(visible: boolean): void;
  setExportDialogVisible(visible: boolean): void;
}

const UiC = React.createContext<UiContext | undefined>(undefined);

/**
 * Context provider that allows sub-components to show import and export modals.
 */
export const UiProvider: React.FC = ({ children }) => {
  const state = useObservable();
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

  const handleExportSubmit = useHandleExportSubmit({
    setExportDialogVisible: setExportDialogVisibleReal,
    setExportLoading,
    setExportErrorMessage,
  });

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
        onSubmit={handleExportSubmit}
      />
    </UiC.Provider>
  );
};

export function useUi() {
  return React.useContext(UiC)!;
}
