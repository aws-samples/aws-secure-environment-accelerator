/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { action, observable } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Box, Button, FormField, Header, Icon, Input, InputProps, Modal, SpaceBetween } from '@awsui/components-react';
import * as t from '@aws-accelerator/common-types';
import { NodeField } from '@/components/node-field';
import { useI18n } from '@/components/i18n-context';
import { toObject } from '@/utils/cast';
import { Field, FieldProps } from './field';

import './dictionary.scss';

/**
 * This functional component renders an "Add" button and all the values in the dictionary and their corresponding "Remove" buttons.
 */
export function DictionaryField(props: FieldProps<t.DictionaryType<t.Any, t.Any>>) {
  const { node, state } = props;
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
      <AddPropertyModal
        title={title}
        visible={modalVisible}
        onDismiss={() => setModalVisible(false)}
        onSubmit={handleSubmit}
      />
      <NodeField {...props} validation={false} stretch>
        <SpaceBetween direction="vertical" size="s">
          <Button onClick={handleAdd}>
            <Icon name="add-plus" /> {tr('buttons.add')}
          </Button>
          <DictionaryFields {...props} />
        </SpaceBetween>
      </NodeField>
    </>
  );
}

/**
 * This functional components renders all the values in the dictionary and their corresponding "Remove" buttons.
 *
 * This component observes the state and will re-render when the dictionary's values change.
 */
const DictionaryFields = observer(function DictionaryFields(props: FieldProps<t.DictionaryType<t.Any, t.Any>>) {
  const { node, state } = props;
  const { tr } = useI18n();

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
        <SpaceBetween direction="vertical" size="s" className="indented">
          <Field state={state} node={elementNode} />
          <Button onClick={handleRemoveFn(key)}>{tr('buttons.remove')}</Button>
        </SpaceBetween>
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
      footer={<Button onClick={handleSubmit}>{tr('buttons.add')}</Button>}
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
