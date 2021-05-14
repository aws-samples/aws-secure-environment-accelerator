/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Button, ButtonProps } from '@awsui/components-react';

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
          Choose file
        </label>
      </Button>
    </>
  );
}
