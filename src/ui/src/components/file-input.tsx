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
import React from 'react';
import { Button, ButtonProps } from '@awsui/components-react';
import { useI18n } from './i18n-context';

export type FileInputState = DoneState | LoadingState | ErrorState;

export interface LoadingState {
  _tag: 'Loading';
}

export interface ErrorState {
  _tag: 'Error';
  error: any;
}

export interface DoneState {
  _tag: 'Done';
  file: Blob;
}

export interface FileInputProps {
  accept?: string;
  onStateChange: (state: FileInputState) => void;
}

export function FileInput(props: FileInputProps) {
  const { tr } = useI18n();
  const fileInputRef = React.createRef<HTMLInputElement>();

  const handleSelectFile: ButtonProps['onClick'] = event => {
    event.stopPropagation();
    event.preventDefault();
    fileInputRef.current?.click();
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = event => {
    props.onStateChange({
      _tag: 'Loading',
    });

    try {
      const file = event.target.files?.[0]!;
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
  };

  return (
    <>
      <input
        id="file"
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        ref={fileInputRef}
        accept={props.accept}
      />
      <Button onClick={handleSelectFile} iconName="upload" iconAlign="right">
        <label htmlFor="file" style={{ cursor: 'pointer' }}>
          {tr('buttons.choose_file')}
        </label>
      </Button>
    </>
  );
}
