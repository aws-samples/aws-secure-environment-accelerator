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
import React, { useCallback, useEffect, useState } from 'react';
import { Errors } from 'io-ts';
import { Box, Button, Header, Modal, SpaceBetween, StatusIndicator, Tabs } from '@awsui/components-react';
import { CodeCommitClient, GetBranchCommand, PutFileCommand } from '@aws-sdk/client-codecommit';
import * as c from '@aws-accelerator/config';
import { usePathHistory } from '@/utils/hooks';
import { useReplacements } from './replacements-context';
import { useAwsConfiguration } from './aws-credentials-context';
import { CodeCommitFilePicker, useCodeCommitInputs } from './codecommit-file-picker';
import { useI18n } from './i18n-context';

type State = InitialState | ValidState | InvalidState;

interface InitialState {
  _tag: 'Initial';
}

interface ValidState {
  _tag: 'Valid';
  configuration: c.AcceleratorConfigType;
}

interface InvalidState {
  _tag: 'Invalid';
  errors: Errors;
}

const initialState: InitialState = { _tag: 'Initial' };

type TabId = 'file' | 'codecommit';

export type ExportModalSubmit = ExportModalFileSubmit | ExportModalCodeCommitSubmit;

export interface ExportModalFileSubmit {
  type: 'file';
  configuration: any;
}

export interface ExportModalCodeCommitSubmit {
  type: 'codecommit';
  configuration: any;
  repositoryName: string;
  branchName: string;
  filePath: string;
}

export interface ExportModalProps {
  state: any;
  visible: boolean;
  loading: boolean;
  errorMessage?: string;
  onDismiss(): void;
  onSubmit(submit: ExportModalSubmit): void;
}

export function ExportModal(props: ExportModalProps): React.ReactElement {
  const { tr } = useI18n();
  const { replaceInObject } = useReplacements();
  const { repositoryNameInputProps, branchNameInputProps, filePathInputProps } = useCodeCommitInputs();
  const [state, setState] = useState<State>(initialState);
  const [tabId, setTabId] = useState<TabId>('file');
  const history = usePathHistory();

  useEffect(() => {
    setState(initialState);

    if (props.visible) {
      const replaced = replaceInObject(props.state);
      const validation = c.AcceleratorConfigType.validate(replaced, []);
      if (validation._tag === 'Right') {
        setState({
          _tag: 'Valid',
          configuration: props.state,
        });
      } else {
        setState({
          _tag: 'Invalid',
          errors: validation.left,
        });
      }
    }
  }, [props.visible, props.state]);

  const handleSubmit = useCallback(() => {
    if (state._tag === 'Valid') {
      if (tabId === 'file') {
        props.onSubmit({
          type: 'file',
          configuration: state.configuration,
        });
      } else {
        props.onSubmit({
          type: 'codecommit',
          configuration: state.configuration,
          repositoryName: repositoryNameInputProps.value,
          branchName: branchNameInputProps.value,
          filePath: filePathInputProps.value,
        });
      }
    }
  }, [state, tabId, repositoryNameInputProps, branchNameInputProps, filePathInputProps, props.onSubmit]);

  let stateComponent = null;
  if (state._tag === 'Valid') {
    stateComponent = (
      <>
        <StatusIndicator type={'success'}>{tr('labels.configuration_is_valid')}</StatusIndicator>
        <Box>{tr('labels.export_introduction')}</Box>
        <Tabs
          activeTabId={tabId}
          onChange={event => setTabId(event.detail.activeTabId as TabId)}
          tabs={[
            {
              id: 'file',
              label: 'File',
              content: <>{tr('labels.export_as_file')}</>,
            },
            {
              id: 'codecommit',
              label: 'CodeCommit',
              content: (
                <SpaceBetween direction="vertical" size="s">
                  <CodeCommitFilePicker
                    repositoryNameInputProps={repositoryNameInputProps}
                    branchNameInputProps={branchNameInputProps}
                    filePathInputProps={filePathInputProps}
                  />
                  {props.errorMessage && <StatusIndicator type={'error'}>{props.errorMessage}</StatusIndicator>}
                </SpaceBetween>
              ),
            },
          ]}
        ></Tabs>
      </>
    );
  } else if (state._tag === 'Invalid') {
    stateComponent = (
      <>
        {state.errors.map((error, index) => {
          const path = error.context.map(entry => entry.key);
          const href = history.createHref(path);
          const message = error.message ?? 'Value should be set.';
          return (
            <React.Fragment key={index}>
              <StatusIndicator type={'warning'}>
                <a href={href}>{path.join('/')}</a>: {message}
              </StatusIndicator>
            </React.Fragment>
          );
        })}
      </>
    );
  }

  return (
    <Modal
      header={<Header variant="h3">{tr('headers.export_configuration')}</Header>}
      visible={props.visible}
      onDismiss={props.onDismiss}
      footer={
        <Box float="right">
          <Button variant="link" onClick={props.onDismiss}>
            {tr('buttons.cancel')}
          </Button>
          <Button variant="primary" disabled={state._tag !== 'Valid'} onClick={handleSubmit} loading={props.loading}>
            {tr('buttons.export')}
          </Button>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="s">
        {stateComponent}
      </SpaceBetween>
    </Modal>
  );
}

export interface HandleExportSubmitProps {
  setExportDialogVisible(visible: boolean): void;
  setExportLoading(visible: boolean): void;
  setExportErrorMessage(message: string): void;
}

/**
 * React hook that handles export to file and CodeCommit.
 */
export function useHandleExportSubmit(props: HandleExportSubmitProps) {
  const { configuration: awsConfiguration } = useAwsConfiguration();
  const { setExportDialogVisible, setExportErrorMessage, setExportLoading } = props;

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
          setExportDialogVisible(false);
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

  return handleSubmit;
}
