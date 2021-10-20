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
import { action, toJS } from 'mobx';
import { observer, useLocalStore } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { Button, Header, Modal, SpaceBetween, Table } from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';
import { TypeTreeNode } from '@/types';
import { WizardField } from './fields';
import { getVpcNodes } from './vpc-table';
import { LabelWithDescription } from './label-with-description';

interface TableItem {
  path: string;
  node: TypeTreeNode;
  value: any;
}

export interface ZoneTableProps {
  state: any;
}

export const ZoneTable: React.VFC<ZoneTableProps> = observer(({ state }) => {
  const { tr } = useI18n();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalNode, setModalNode] = useState<TypeTreeNode | undefined>();
  const [selectedItem, setSelectedItem] = useState<TableItem | undefined>();

  const nodes = getVpcNodes(state);
  const items: TableItem[] = nodes.map(node => ({
    path: node.path.join('/'),
    node,
    value: node.get(state),
  }));

  const handleEdit = () => {
    setModalNode(selectedItem?.node);
    setModalVisible(true);
  };

  const handleSubmit = action((value: any) => {
    modalNode?.set(state, value);
    setModalVisible(false);
  });

  return (
    <>
      {modalNode && (
        <EditVpcZoneModal
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
            header: tr('wizard.labels.zone_account'),
            cell: ({ node }) => node.path?.[1],
          },
          {
            header: tr('wizard.labels.zone_vpc_name'),
            cell: ({ value }) => value.name,
          },
          {
            header: tr('wizard.labels.zone_central_vpc'),
            cell: ({ value }) => (hasCentralEndpoint(value) ? 'Yes' : 'No'),
          },
          {
            header: tr('wizard.labels.zone_has_zones'),
            cell: ({ value }) => (hasZones(value) ? 'Yes' : 'No'),
          },
          {
            header: tr('wizard.labels.zone_has_resolvers'),
            cell: ({ value }) => (hasResolvers(value) ? 'Yes' : 'No'),
          },
        ]}
        header={
          <Header
            variant="h2"
            counter={`(${nodes.length})`}
            description={tr('wizard.headers.zones_desc')}
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                <Button disabled={selectedItem == null} onClick={handleEdit}>
                  {tr('buttons.edit')}
                </Button>
              </SpaceBetween>
            }
          >
            {tr('wizard.headers.zones')}
          </Header>
        }
      />
    </>
  );
});

interface EditVpcZoneModalProps {
  visible: boolean;
  node: TypeTreeNode;
  state: any;
  onDismiss: () => void;
  onSubmit: (value: any) => void;
}

/**
 * This component renders the add modal to add a new CIDR pool.
 */
const EditVpcZoneModal = observer(function EditVpcZoneModal({
  visible,
  node,
  state,
  onDismiss,
  onSubmit,
}: EditVpcZoneModalProps) {
  const { tr } = useI18n();
  const staging = useLocalStore(() => ({}));

  const handleSubmit = () => {
    // Get the VPC from the staging state
    onSubmit(node.get(staging));
  };

  // Write the state value to the staging value
  useEffect(() => {
    const value = node.get(state);
    node.set(staging, toJS(value));
  }, [visible]);

  return (
    <Modal
      visible={visible}
      header={<Header variant="h3">{tr('wizard.headers.edit_zone')}</Header>}
      footer={
        <Button variant="primary" className="float-button" onClick={handleSubmit}>
          {tr('buttons.save_changes')}
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
        <SpaceBetween size="s">
          <WizardField state={staging} node={node.nested('central-endpoint')} />
          <WizardField state={staging} node={node.nested('zones')} />
          <WizardField state={staging} node={node.nested('resolvers')} />
        </SpaceBetween>
      </form>
    </Modal>
  );
});

function hasCentralEndpoint(value: any) {
  return value['central-endpoint'];
}

function hasZones(value: any) {
  return (value?.zones?.public?.length ?? 0) > 0 || (value?.zones?.private?.length ?? 0) > 0;
}

function hasResolvers(value: any) {
  return value?.resolvers?.outbound || value?.resolvers?.inbound;
}
