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
import { useEffect, useState } from 'react';
import { action, toJS } from 'mobx';
import { observer, useLocalStore } from 'mobx-react-lite';
import * as c from '@aws-accelerator/config';
import { Button, Checkbox, FormField, Header, Modal, SpaceBetween, Table } from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';
import { TypeTreeNode } from '@/types';
import { AcceleratorConfigurationNode } from '../configuration';
import { WizardField } from '../components/fields';
import { isDisabled, setDisabled } from '../util';
import { LabelWithDescription } from './label-with-description';

const mandatoryAccountConfigNode = AcceleratorConfigurationNode.nested('mandatory-account-configs');
const workloadAccountConfigNode = AcceleratorConfigurationNode.nested('workload-account-configs');

interface TableItem {
  path: string;
  accountKey: string;
  node: TypeTreeNode;
  value: any;
}

export interface MadTableProps {
  state: any;
}

export const MadTable = observer(function MadTable({ state }: MadTableProps) {
  const { tr } = useI18n();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalNode, setModalNode] = useState<TypeTreeNode | undefined>();
  const [selectedItem, setSelectedItem] = useState<TableItem | undefined>();

  const nodes = [
    ...Object.keys(mandatoryAccountConfigNode.get(state) ?? {}).map(accountKey => ({
      accountKey,
      // prettier-ignore
      node: mandatoryAccountConfigNode
        .nested(accountKey)
        .nested('deployments')
        .nested<typeof c.MadConfigType>('mad'),
    })),
    ...Object.keys(workloadAccountConfigNode.get(state) ?? {}).map(accountKey => ({
      accountKey,
      // prettier-ignore
      node: workloadAccountConfigNode
        .nested(accountKey)
        .nested('deployments')
        .nested<typeof c.MadConfigType>('mad'),
    })),
  ];

  const items: TableItem[] = nodes
    .map(({ accountKey, node }) => ({
      path: node.path.join('/'),
      accountKey,
      node,
      value: node.get(state),
    }))
    .filter(({ value }) => !!value);

  const handleEdit = () => {
    setModalNode(selectedItem?.node);
    setModalVisible(true);
  };

  const handleSubmit = action(({ value, enabled }: { value: any; enabled: boolean }) => {
    modalNode?.set(state, value);
    modalNode && setDisabled(state, modalNode.path, !enabled);
    setModalVisible(false);
  });

  return (
    <>
      {modalNode && (
        <EditMadModal
          visible={modalVisible}
          node={modalNode}
          state={state}
          onDismiss={() => setModalVisible(false)}
          onSubmit={handleSubmit}
        />
      )}
      <Table
        items={items}
        trackBy="path"
        selectionType="single"
        selectedItems={selectedItem ? [selectedItem] : []}
        onSelectionChange={e => setSelectedItem(e.detail.selectedItems?.[0])}
        columnDefinitions={[
          {
            header: 'Account',
            cell: ({ value, accountKey }) => (
              <LabelWithDescription label={accountKey} description={value?.description} />
            ),
          },
          {
            header: 'Directory ID',
            cell: ({ value }) => value['dir-id'],
          },
          {
            header: 'Enabled',
            cell: ({ node }) => (!isDisabled(state, node.path) ? 'Yes' : 'No'),
          },
          {
            header: 'DNS Domain',
            cell: ({ value }) => value['dns-domain'],
          },
          {
            header: 'Netbios Domain',
            cell: ({ value }) => value['netbios-domain'],
          },
        ]}
        header={
          <Header
            variant="h2"
            counter={`(${nodes.length})`}
            description={tr('wizard.headers.mads_desc')}
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                <Button disabled={selectedItem == null} onClick={handleEdit}>
                  {tr('buttons.edit')}
                </Button>
              </SpaceBetween>
            }
          >
            {tr('wizard.headers.mads')}
          </Header>
        }
      />
    </>
  );
});

interface EditMadModalProps {
  visible: boolean;
  node: TypeTreeNode;
  state: any;
  onDismiss: () => void;
  onSubmit: (props: { value: any; enabled: boolean }) => void;
}

/**
 * This component renders the add modal to add a new MAD.
 */
const EditMadModal = observer(function EditMadModal({ visible, node, state, onDismiss, onSubmit }: EditMadModalProps) {
  const { tr } = useI18n();
  const staging = useLocalStore(() => ({}));
  const [enabled, setEnabled] = useState(false);

  const handleSubmit = () => {
    // Get the MAD from the staging state
    onSubmit({
      value: node.get(staging),
      enabled,
    });
  };

  // Write the state value to the staging value
  useEffect(() => {
    const value = node.get(state);
    node.set(staging, toJS(value));
    setEnabled(!isDisabled(state, node.path));
  }, [visible]);

  return (
    <Modal
      visible={visible}
      header={<Header variant="h3">{tr('wizard.headers.edit_mad')}</Header>}
      footer={
        <Button variant="primary" onClick={handleSubmit}>
          {tr('buttons.edit')}
        </Button>
      }
      onDismiss={onDismiss}
    >
      <form
        onSubmit={event => {
          event.stopPropagation();
          event.preventDefault();
          handleSubmit();
        }}
      >
        <SpaceBetween size="m">
          <FormField label="Enabled">
            <Checkbox checked={enabled} onChange={event => setEnabled(event.detail.checked)} />
          </FormField>
          {enabled && (
            <SpaceBetween size="m">
              <WizardField state={staging} node={node.nested('dir-id')} />
              <WizardField state={staging} node={node.nested('dns-domain')} />
              <WizardField state={staging} node={node.nested('netbios-domain')} />
              <WizardField state={staging} node={node.nested('ad-users')} />
            </SpaceBetween>
          )}
        </SpaceBetween>
      </form>
    </Modal>
  );
});
