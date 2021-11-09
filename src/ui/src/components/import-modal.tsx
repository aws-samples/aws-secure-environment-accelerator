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
import { createReplacements } from '@/components/replacements-context';
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
          const raw = JSON.parse(content);
          const replacements = createReplacements(raw.replacements || {});
          const replaced = replacements.replaceInString(content);
          const object = JSON.parse(replaced);
          const validation = c.AcceleratorConfigType.validate(object, []);
          if (validation._tag === 'Right') {
            setState({
              _tag: 'Valid',
              // Use the raw JSON object instead of the validated configuration object.
              // Otherwise we will end up with values that are replaced by the replacements object.
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
    stateComponent = <StatusIndicator type={'loading'}>{tr('labels.loading')}</StatusIndicator>;
  } else if (state._tag === 'Valid') {
    stateComponent = <StatusIndicator type={'success'}>{tr('labels.selected_configuration_is_valid')}</StatusIndicator>;
  } else if (state._tag === 'Error') {
    stateComponent = <StatusIndicator type={'warning'}>{`${state.error}`}</StatusIndicator>;
  } else if (state._tag === 'Invalid') {
    stateComponent = (
      <>
        <FormField label={tr('labels.import_with_errors')} description={tr('labels.import_with_errors_description')}>
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
      header={<Header variant="h3">{tr('headers.import_configuration')}</Header>}
      visible={props.visible}
      onDismiss={props.onDismiss}
      footer={
        <Box float="right">
          <Button variant="link" onClick={props.onDismiss}>
            {tr('buttons.cancel')}
          </Button>
          <Button variant="primary" disabled={state._tag !== 'Valid' && !importOverride} onClick={handleSubmit}>
            {tr('buttons.import')}
          </Button>
        </Box>
      }
    >
      <>
        <Box>{tr('labels.import_configuration_introduction')}</Box>
        <Tabs
          activeTabId={tabId}
          onChange={event => setTabId(event.detail.activeTabId as TabId)}
          tabs={[
            {
              id: 'file',
              label: tr('headers.import_file'),
              content: (
                <SpaceBetween direction="vertical" size="s">
                  <FormField
                    label={tr('labels.configuration_file')}
                    description={tr('labels.configuration_file_description')}
                    constraintText={tr('labels.configuration_file_constraint')}
                  >
                    <FileInput onStateChange={handleFileChange} />
                  </FormField>
                  {stateComponent}
                </SpaceBetween>
              ),
            },
            {
              id: 'codecommit',
              label: tr('headers.import_codecommit'),
              content: (
                <SpaceBetween direction="vertical" size="s">
                  <FormField
                    label={tr('labels.configuration_file')}
                    description={tr('labels.configuration_file_description')}
                    constraintText={tr('labels.configuration_file_constraint')}
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
