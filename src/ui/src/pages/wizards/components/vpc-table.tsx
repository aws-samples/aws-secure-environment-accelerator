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
import {
  Button,
  Checkbox,
  FormField,
  Header,
  Input,
  Modal,
  SpaceBetween,
  StatusIndicator,
  Table,
} from '@awsui/components-react';
import * as c from '@aws-accelerator/config';
import { useI18n } from '@/components/i18n-context';
import { TypeTreeNode } from '@/types';
import { AcceleratorConfigurationNode } from '../configuration';
import { WizardField } from './fields';
import { isDisabled, setDisabled } from '../util';
import { LabelWithDescription } from './label-with-description';

const ouConfigNode = AcceleratorConfigurationNode.nested('organizational-units');
const mandatoryAccountConfigNode = AcceleratorConfigurationNode.nested('mandatory-account-configs');
const workloadAccountConfigNode = AcceleratorConfigurationNode.nested('workload-account-configs');

interface TableItem {
  path: string;
  node: TypeTreeNode;
  value: any;
}

export interface VpcTableProps {
  state: any;
}

export const VpcTable: React.VFC<VpcTableProps> = observer(({ state }) => {
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

  const handleSubmit = action(({ value, tgwAttachEnabled }: { value: any; tgwAttachEnabled: boolean }) => {
    modalNode?.set(state, value);
    modalNode && setDisabled(state, [...modalNode.path, 'tgw-attach'], !tgwAttachEnabled);
    setModalVisible(false);
  });

  return (
    <>
      {modalNode && (
        <EditVpcModal
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
            header: 'Name',
            cell: ({ value }) => <LabelWithDescription label={value.name} description={value.description} />,
          },
          {
            header: 'Defined in',
            cell: ({ node }) => getDefinedIn({ node }),
          },
          {
            header: 'Deploy',
            cell: ({ value }) => value.deploy,
          },
          {
            header: 'Shared',
            cell: ({ node }) => (isSubnetShared({ state, node }) ? 'Yes' : 'No'),
          },
          {
            header: 'TGW Attached',
            cell: ({ node }) => (isTgwAttached({ state, node }) ? 'Yes' : 'No'),
          },
          {
            header: 'Region',
            cell: ({ value }) => value.region,
          },
          {
            header: 'CIDR pool',
            cell: ({ value }) => value.cidr?.[0]?.pool,
          },
          {
            header: 'CIDR size',
            cell: ({ value }) => value.cidr?.[0]?.size,
          },
        ]}
        header={
          <Header
            variant="h2"
            counter={`(${nodes.length})`}
            description={tr('wizard.headers.vpcs_desc')}
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                <Button disabled={selectedItem == null} onClick={handleEdit}>
                  {tr('buttons.edit')}
                </Button>
              </SpaceBetween>
            }
          >
            {tr('wizard.headers.vpcs')}
          </Header>
        }
        footer={<StatusIndicator type="info">{tr('wizard.labels.vpcs_use_graphical_editor')}</StatusIndicator>}
      />
    </>
  );
});

interface EditVpcModalProps {
  visible: boolean;
  node: TypeTreeNode;
  state: any;
  onDismiss: () => void;
  onSubmit: (props: { value: any; tgwAttachEnabled: boolean }) => void;
}

/**
 * This component renders the add modal to add a new CIDR pool.
 */
const EditVpcModal = observer(function EditVpcModal({ visible, node, state, onDismiss, onSubmit }: EditVpcModalProps) {
  const { tr } = useI18n();
  const staging = useLocalStore(() => ({}));
  const [tgwAttachEnabled, setEnabled] = useState(false);

  const cidrNode = node.nested('cidr').nested(0);
  const tgwAttachNode = node.nested('tgw-attach');
  const tgwAttach = tgwAttachNode.get(state);

  const handleSubmit = () => {
    // Get the VPC from the staging state
    onSubmit({
      value: node.get(staging),
      tgwAttachEnabled,
    });
  };

  // Write the state value to the staging value
  useEffect(() => {
    const value = node.get(state);
    node.set(staging, toJS(value));
    setEnabled(tgwAttach && !isDisabled(state, tgwAttachNode.path));
  }, [visible]);

  return (
    <Modal
      visible={visible}
      header={<Header variant="h3">{tr('wizard.headers.edit_vpc')}</Header>}
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
        <SpaceBetween size="s">
          <WizardField state={staging} node={node.nested('name')} disabled={true} />
          <FormField label="Defined in" stretch>
            <Input value={getDefinedIn({ node })} disabled />
          </FormField>
          <WizardField state={staging} node={node.nested('deploy')} />
          <WizardField state={staging} node={node.nested('region')} />
          <WizardField state={staging} node={cidrNode.nested('pool')} />
          <WizardField state={staging} node={cidrNode.nested('size')} />
          <SpaceBetween size="s" direction="horizontal">
            <Checkbox checked={isSubnetShared({ state, node })} disabled />
            <span>Subnet shared</span>
          </SpaceBetween>
          <SpaceBetween size="s" direction="horizontal">
            <Checkbox
              checked={tgwAttachEnabled}
              onChange={event => setEnabled(event.detail.checked)}
              disabled={tgwAttach == null}
            />
            <span>Transit gateway attached</span>
          </SpaceBetween>
        </SpaceBetween>
      </form>
    </Modal>
  );
});

export function getVpcNodes(state: any) {
  return [
    ...getAccountOrOuVpcNodes(ouConfigNode, state),
    ...getAccountOrOuVpcNodes(mandatoryAccountConfigNode, state),
    ...getAccountOrOuVpcNodes(workloadAccountConfigNode, state),
  ];
}

function getAccountOrOuVpcNodes(node: TypeTreeNode, state: any): TypeTreeNode<typeof c.VpcConfigType>[] {
  return Object.keys(node.get(state) ?? {}).flatMap(accountKey => {
    // prettier-ignore
    const vpcArrayNode = node
        .nested(accountKey)
        .nested<typeof c.VpcConfigType>('vpc');
    const vpcArray = vpcArrayNode.get(state) ?? [];
    return Object.keys(vpcArray).map(key => vpcArrayNode.nested(key));
  });
}

function isSubnetShared({ state, node }: { state: any; node: TypeTreeNode }) {
  const value = node.get(state);
  return value?.subnets?.find((s: any) => s['share-to-ou-accounts'] || s['share-to-specific-accounts']) != null;
}

function isTgwAttached({ state, node }: { state: any; node: TypeTreeNode }) {
  const tgwNode = node.nested('tgw-attach');
  const tgw = tgwNode.get(state);
  return tgw && !isDisabled(state, tgwNode.path);
}

function getDefinedIn({ node }: { node: TypeTreeNode }) {
  return node.path[0] === 'organizational-units' ? 'Organizational Unit' : 'Account';
}
