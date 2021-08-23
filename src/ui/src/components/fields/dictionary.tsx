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
import React, { useState, useEffect } from 'react';
import { action, observable } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Box, Button, FormField, Header, Icon, Input, InputProps, Modal, SpaceBetween } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { FormFieldWrapper } from '@/components/node-field';
import { useI18n } from '@/components/i18n-context';
import { Indent } from '@/components/indent';
import { toObject } from '@/utils/cast';
import { Field, FieldProps } from './field';

export type DictionaryFormFieldProps = FieldProps<t.DictionaryType<t.Any, t.Any>>;

/**
 * This functional component renders an "Add" button and all the values in the dictionary and their corresponding "Remove" buttons.
 */
export function DictionaryFormField(props: DictionaryFormFieldProps) {
  const { disabled = false, node, state, FieldWrapperC = FormFieldWrapper } = props;
  const [modalVisible, setModalVisible] = useState(false);
  const { tr } = useI18n();
  const { title } = tr(node);

  const handleAdd = () => {
    setModalVisible(true);
  };

  const handleSubmit = action((key: string) => {
    const value = node.get(state);
    const newValue = value ? { ...value, [key]: undefined } : { [key]: undefined };
    node.set(state, observable(newValue));
    setModalVisible(false);
  });

  return (
    <>
      {!disabled && (
        <AddPropertyModal
          title={title}
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          onSubmit={handleSubmit}
        />
      )}
      <FieldWrapperC {...props} validation={false}>
        <SpaceBetween direction="vertical" size="s">
          {!disabled && (
            <Button onClick={handleAdd} iconName="add-plus" formAction="none">
              {tr('buttons.add', { title })}
            </Button>
          )}
          <DictionaryFields {...props} />
        </SpaceBetween>
      </FieldWrapperC>
    </>
  );
}

/**
 * This functional components renders all the values in the dictionary and their corresponding "Remove" buttons.
 *
 * This component observes the state and will re-render when the dictionary's values change.
 */
const DictionaryFields = observer(function DictionaryFields(props: FieldProps<t.DictionaryType<t.Any, t.Any>>) {
  const { disabled = false, node, state, FieldC = Field } = props;
  const { tr } = useI18n();
  const { title } = tr(node);

  const handleRemoveFn = (key: string) =>
    action(() => {
      const currentValue = toObject(node.get(state));
      const newValue = { ...currentValue };
      delete newValue[key];
      node.set(state, observable(newValue));
    });

  const value = toObject(node.get(state));
  const fields = Object.keys(value)?.map((key: string, index: number) => {
    const elementNode = node.nested(key);
    return (
      <React.Fragment key={key}>
        {index > 0 ? <Box className="divider" /> : null}
        <Indent>
          <SpaceBetween direction="vertical" size="s">
            <FieldC
              state={state}
              node={elementNode}
              context={props.context}
              FieldC={props.FieldC}
              FieldWrapperC={props.FieldWrapperC}
            />
            {!disabled && (
              <Button onClick={handleRemoveFn(key)} iconName="close" formAction="none">
                {tr('buttons.remove', { title })}
              </Button>
            )}
          </SpaceBetween>
        </Indent>
      </React.Fragment>
    );
  });

  return (
    <SpaceBetween direction="vertical" size="m">
      {fields}
    </SpaceBetween>
  );
});

/**
 * This functional component renders the add modal to add a new property to the dictionary.
 */
function AddPropertyModal(props: {
  title?: string;
  visible: boolean;
  onDismiss: () => void;
  onSubmit: (key: string) => void;
}) {
  const inputRef = React.createRef<InputProps.Ref>();
  const [key, setKey] = useState('');
  const { tr } = useI18n();

  const handleSubmit = () => props.onSubmit(key);
  const handleChange: InputProps['onChange'] = e => setKey(e.detail.value);

  useEffect(() => {
    // Reset key when visibility changes
    setKey('');
    // Focus field
    inputRef.current?.focus();
  }, [props.visible]);

  return (
    <Modal
      visible={props.visible}
      header={<Header variant="h3">{tr('headers.add_dictionary_field', { value: props.title })}</Header>}
      footer={<Button onClick={handleSubmit}>{tr('buttons.add', { title: props.title })}</Button>}
      onDismiss={props.onDismiss}
    >
      <form
        onSubmit={event => {
          event.stopPropagation();
          event.preventDefault();
          props.onSubmit(key);
        }}
      >
        <FormField label={'Key'}>
          <Input value={key} onChange={handleChange} ref={inputRef} />
        </FormField>
      </form>
    </Modal>
  );
}
