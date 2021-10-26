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
import { memo, useCallback, useState } from 'react';
import { Box, Button, FormField, Header, Input, Modal, SpaceBetween } from '@awsui/components-react';
import { UseInput, useStorageInput } from '@/utils/hooks';
import { CodeCommitClient, GetFileCommand } from '@aws-sdk/client-codecommit';
import { FileInputState } from './file-input';
import { useAwsConfiguration } from './aws-credentials-context';

import './codecommit-file-picker.scss';
import { useI18n } from './i18n-context';

export interface CodeCommitFilePickerInputs {
  repositoryNameInputProps: UseInput;
  branchNameInputProps: UseInput;
  filePathInputProps: UseInput;
}

export function useCodeCommitInputs(): CodeCommitFilePickerInputs {
  const repositoryNameInputProps = useStorageInput('codecommit.repository');
  const branchNameInputProps = useStorageInput('codecommit.branch', 'main');
  const filePathInputProps = useStorageInput('codecommit.file', 'config.json');
  return {
    repositoryNameInputProps,
    branchNameInputProps,
    filePathInputProps,
  };
}

export interface CodeCommitFilePickerProps extends CodeCommitFilePickerInputs {
  repositoryLabelDescription?: string;
  branchLabelDescription?: string;
  filePathLabelDescription?: string;
}

export const CodeCommitFilePicker = function CodeCommitFilePicker(props: CodeCommitFilePickerProps) {
  const { setModalVisible: setAwsConfigurationModalVisible } = useAwsConfiguration();
  const { tr } = useI18n();
  // TODO

  const {
    repositoryLabelDescription = tr('labels.codecommit_repository_description'),
    branchLabelDescription = tr('labels.codecommit_branch_description'),
    filePathLabelDescription = tr('labels.codecommit_file_description'),
  } = props;

  const handleAwsConfiguration = useCallback(() => {
    setAwsConfigurationModalVisible(true);
  }, []);

  return (
    <>
      <Button onClick={handleAwsConfiguration}>{tr('wizard.buttons.export_configure_credentials')}</Button>
      <FormField label={tr('labels.codecommit_repository')} description={repositoryLabelDescription}>
        <Input {...props.repositoryNameInputProps} />
      </FormField>
      <FormField label={tr('labels.codecommit_branch')} description={branchLabelDescription}>
        <Input {...props.branchNameInputProps} />
      </FormField>
      <FormField label={tr('labels.codecommit_file')} description={filePathLabelDescription}>
        <Input {...props.filePathInputProps} />
      </FormField>
    </>
  );
};

export interface CodeCommitFilePickerResult {
  repositoryName: string;
  branchName: string;
  filePath: string;
}

export interface CodeCommitFilePickerModalProps {
  visible: boolean;
  title?: string;
  repositoryLabelDescription?: string;
  branchLabelDescription?: string;
  filePathLabelDescription?: string;
  onSubmit(values: CodeCommitFilePickerResult): void;
  onDismiss(): void;
}

export const CodeCommitFilePickerModel = memo(function CodeCommitFilePickerModel(
  props: CodeCommitFilePickerModalProps,
) {
  const { tr } = useI18n();
  const { title = tr('headers.choose_codecommit_file') } = props;
  const { repositoryNameInputProps, branchNameInputProps, filePathInputProps } = useCodeCommitInputs();

  const handleDismiss = useCallback(() => {
    props.onDismiss();
  }, [props.onDismiss]);

  const handleSubmit = useCallback(() => {
    props.onSubmit({
      repositoryName: repositoryNameInputProps.value,
      branchName: branchNameInputProps.value,
      filePath: filePathInputProps.value,
    });
  }, [props.onSubmit, repositoryNameInputProps, branchNameInputProps, filePathInputProps]);

  return (
    <>
      <Modal
        className="codecommit-file-input-modal"
        visible={props.visible}
        onDismiss={handleDismiss}
        header={<Header variant="h3">{title}</Header>}
        footer={
          <Box float="right">
            <Button variant="link" onClick={handleDismiss}>
              {tr('buttons.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              {tr('buttons.choose')}
            </Button>
          </Box>
        }
      >
        <SpaceBetween direction="vertical" size="s">
          <CodeCommitFilePicker
            repositoryLabelDescription={props.repositoryLabelDescription}
            repositoryNameInputProps={repositoryNameInputProps}
            branchLabelDescription={props.branchLabelDescription}
            branchNameInputProps={branchNameInputProps}
            filePathLabelDescription={props.filePathLabelDescription}
            filePathInputProps={filePathInputProps}
          />
        </SpaceBetween>
      </Modal>
    </>
  );
});

export interface CodeCommitFileInputProps {
  onStateChange: (state: FileInputState) => void;
}

export function CodeCommitFileInput(props: CodeCommitFileInputProps) {
  const { tr } = useI18n();
  const { configuration: awsConfiguration } = useAwsConfiguration();
  const [visible, setVisible] = useState(false);

  const handleSelectFile = useCallback(() => {
    setVisible(true);
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const handleSubmit = useCallback(
    ({ repositoryName, filePath }: CodeCommitFilePickerResult) => {
      setVisible(false);

      props.onStateChange({
        _tag: 'Loading',
      });

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      (async () => {
        try {
          const client = new CodeCommitClient(awsConfiguration);

          const response = await client.send(
            new GetFileCommand({
              repositoryName,
              filePath,
            }),
          );

          const file: Blob = new Blob([response.fileContent!]);
          props.onStateChange({
            _tag: 'Done',
            file,
          });
        } catch (error) {
          props.onStateChange({
            _tag: 'Error',
            error,
          });
        }
      })();
    },
    [awsConfiguration, props.onStateChange],
  );

  return (
    <>
      <Button onClick={handleSelectFile} iconName="upload" iconAlign="right">
        {tr('buttons.choose_file')}
      </Button>
      <CodeCommitFilePickerModel visible={visible} onDismiss={handleDismiss} onSubmit={handleSubmit} />
    </>
  );
}
