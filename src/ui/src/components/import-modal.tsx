/* eslint-disable @typescript-eslint/no-explicit-any */
import * as c from '@aws-accelerator/config';
import { Errors } from 'io-ts';
import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormField,
  Header,
  Modal,
  SpaceBetween,
  StatusIndicator,
  Tabs,
} from '@awsui/components-react';
import { CodeCommitFileInput, ErrorState, FileInput, FileInputState, LoadingState } from '@/components';
import { useReplacements } from '@/components/replacements-context';
import { useI18n } from './i18n-context';

import './import-modal.scss';

type State = InitialState | ErrorState | LoadingState | ValidState | InvalidState;

interface InitialState {
  _tag: 'Initial';
}

interface ValidState {
  _tag: 'Valid';
  configuration: c.AcceleratorConfigType;
}

interface InvalidState {
  _tag: 'Invalid';
  configuration: any;
  errors: Errors;
}

const initialState: InitialState = { _tag: 'Initial' };

type TabId = 'file' | 'codecommit';

export interface ImportModalProps {
  visible: boolean;
  onDismiss(): void;
  onSubmit(value: c.AcceleratorConfigType): void;
}

export function ImportModal(props: ImportModalProps): React.ReactElement {
  const { replaceInString } = useReplacements();
  const { tr } = useI18n();
  const [state, setState] = useState<State>(initialState);
  const [tabId, setTabId] = useState<TabId>('file');
  const [importOverride, setImportOverride] = useState(false);

  useEffect(() => {
    setState(initialState);
    setImportOverride(false);
  }, [tabId, props.visible]);

  const handleSubmit = () => {
    if (state._tag === 'Valid' || (state._tag === 'Invalid' && importOverride)) {
      props.onSubmit(state.configuration);
    }
  };

  const handleFileChange = (state: FileInputState) => {
    // eslint-disable-next-line default-case
    switch (state._tag) {
      case 'Loading':
      case 'Error':
        setState(state);
        return;
    }

    const file = state.file;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      try {
        const content = await file?.text();
        if (content) {
          const replaced = replaceInString(content);
          const object = JSON.parse(replaced);
          const validation = c.AcceleratorConfigType.validate(object, []);
          if (validation._tag === 'Right') {
            setState({
              _tag: 'Valid',
              configuration: object,
            });
          } else {
            setState({
              _tag: 'Invalid',
              configuration: object,
              errors: validation.left,
            });
          }
        } else {
          setState({
            _tag: 'Error',
            error: 'Could not load file content.',
          });
        }
      } catch (error) {
        setState({
          _tag: 'Error',
          error,
        });
      }
    })();
  };

  let stateComponent = null;
  if (state._tag === 'Loading') {
    stateComponent = <StatusIndicator type={'loading'}>Loading...</StatusIndicator>;
  } else if (state._tag === 'Valid') {
    stateComponent = <StatusIndicator type={'success'}>The selected configuration file is valid.</StatusIndicator>;
  } else if (state._tag === 'Error') {
    stateComponent = <StatusIndicator type={'warning'}>{`${state.error}`}</StatusIndicator>;
  } else if (state._tag === 'Invalid') {
    stateComponent = (
      <>
        <FormField label="Import with errors" description="The file will be imported even though there are errors.">
          <Checkbox checked={importOverride} onChange={event => setImportOverride(event.detail.checked)} />
        </FormField>
        {state.errors.map((error, index) => (
          <StatusIndicator key={index} type={'warning'}>
            {error.context.map(c => c.key).join('/')}: {`${error?.message ?? error}`}
          </StatusIndicator>
        ))}
      </>
    );
  }

  return (
    <Modal
      className="import-modal"
      header={<Header variant="h3">{tr('import.title')}</Header>}
      visible={props.visible}
      onDismiss={props.onDismiss}
      footer={
        <Box float="right">
          <Button variant="link" onClick={props.onDismiss}>
            Cancel
          </Button>
          <Button variant="primary" disabled={state._tag !== 'Valid' && !importOverride} onClick={handleSubmit}>
            Import
          </Button>
        </Box>
      }
    >
      <>
        <Box>You can import configuration by uploading a file or choosing a file in CodeCommit.</Box>
        <Tabs
          activeTabId={tabId}
          onChange={event => setTabId(event.detail.activeTabId as TabId)}
          tabs={[
            {
              id: 'file',
              label: 'File',
              content: (
                <SpaceBetween direction="vertical" size="s">
                  <FormField
                    label="Configuration file"
                    description="Upload a configuration file"
                    constraintText="JSON formatted file"
                  >
                    <FileInput onStateChange={handleFileChange} />
                  </FormField>
                  {stateComponent}
                </SpaceBetween>
              ),
            },
            {
              id: 'codecommit',
              label: 'CodeCommit',
              content: (
                <SpaceBetween direction="vertical" size="s">
                  <FormField
                    label="Configuration file"
                    description="Upload a configuration file"
                    constraintText="JSON formatted file"
                  >
                    <CodeCommitFileInput onStateChange={handleFileChange} />
                  </FormField>
                  {stateComponent}
                </SpaceBetween>
              ),
            },
          ]}
        ></Tabs>
      </>
    </Modal>
  );
}
