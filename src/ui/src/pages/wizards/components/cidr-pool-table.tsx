/* eslint-disable @typescript-eslint/no-explicit-any */
import { action, toJS } from 'mobx';
import { observer, useLocalStore } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { Button, Header, Modal, SpaceBetween, StatusIndicator, Table } from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';
import { valueAsArray } from '@/utils';
import { AcceleratorConfigurationNode } from '../configuration';
import { WizardField } from './fields';
import { LabelWithDescription } from './label-with-description';

const cidrPoolsNode = AcceleratorConfigurationNode.nested('global-options').nested('cidr-pools');
const dummyCidrPoolNode = cidrPoolsNode.nested(0);

export interface CidrPoolTableProps {
  state: any;
}

export const CidrPoolTable: React.VFC<CidrPoolTableProps> = observer(({ state }) => {
  const { tr } = useI18n();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'add' | 'edit'>('add');
  const [modalInitialValue, setModalInitialValue] = useState<any>({});
  const [selectedItem, setSelectedItem] = useState<any>();

  // Fetch translations to be used as table headers
  const { title: nameTitle } = tr(dummyCidrPoolNode.nested('pool'));
  const { title: cidrTitle } = tr(dummyCidrPoolNode.nested('cidr'));
  const { title: regionTitle } = tr(dummyCidrPoolNode.nested('region'));

  const pools = valueAsArray(cidrPoolsNode.get(state));

  const handleAdd = () => {
    setModalType('add');
    setModalInitialValue({});
    setModalVisible(true);
  };

  const handleEdit = () => {
    setModalType('edit');
    setModalInitialValue(selectedItem ? toJS(selectedItem) : {});
    setModalVisible(true);
  };

  const handleSubmitAdd = action((value: any) => {
    cidrPoolsNode.set(state, [...pools, value]);
  });

  const handleSubmitEdit = action((value: any) => {
    if (selectedItem) {
      // TODO Rename CIDR pools throughout configuration file
      // selectedItem.name = value.name;
      selectedItem.cidr = value.cidr;
      selectedItem.region = value.region;
    }
  });

  const handleSubmit = action((value: any) => {
    if (modalType === 'add') {
      handleSubmitAdd(value);
    } else {
      handleSubmitEdit(value);
    }
    setSelectedItem(undefined);
    setModalVisible(false);
  });

  const handleRemove = action(() => {
    const newPools = pools.filter(pool => selectedItem?.pool !== pool.pool);
    cidrPoolsNode.set(state, newPools);
    setSelectedItem(undefined);
  });

  return (
    <>
      <AddCidrPoolModal
        type={modalType}
        visible={modalVisible}
        initialValue={modalInitialValue}
        onDismiss={() => setModalVisible(false)}
        onSubmit={handleSubmit}
      />
      <Table
        items={pools}
        trackBy="pool"
        selectionType="single"
        selectedItems={selectedItem ? [selectedItem] : []}
        onSelectionChange={e => setSelectedItem(e.detail.selectedItems?.[0])}
        columnDefinitions={[
          {
            header: nameTitle,
            cell: ({ pool, description }) => <LabelWithDescription label={pool} description={description} />,
          },
          {
            header: cidrTitle,
            cell: ({ cidr }) => cidr,
          },
          {
            header: regionTitle,
            cell: ({ region }) => region,
          },
        ]}
        header={
          <Header
            variant="h2"
            counter={`(${pools.length})`}
            description={tr('wizard.headers.cidr_pools_desc')}
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                <Button disabled={selectedItem == null} onClick={handleRemove}>
                  {tr('buttons.remove')}
                </Button>
                <Button disabled={selectedItem == null} onClick={handleEdit}>
                  {tr('buttons.edit')}
                </Button>
                <Button iconName="add-plus" variant="primary" onClick={handleAdd}>
                  {tr('buttons.add')}
                </Button>
              </SpaceBetween>
            }
          >
            {tr('wizard.headers.cidr_pools')}
          </Header>
        }
        footer={<StatusIndicator type="info">{tr('wizard.labels.cidr_pools_use_graphical_editor')}</StatusIndicator>}
      />
    </>
  );
});

interface AddCidrPoolModalProps {
  type: 'add' | 'edit';
  visible: boolean;
  initialValue: any;
  onDismiss: () => void;
  onSubmit: (value: any) => void;
}

/**
 * This component renders the add modal to add a new CIDR pool.
 */
const AddCidrPoolModal = observer(function AddCidrPoolModal({
  type,
  visible,
  initialValue,
  onDismiss,
  onSubmit,
}: AddCidrPoolModalProps) {
  const { tr } = useI18n();
  const staging = useLocalStore(() => ({}));

  // prettier-ignore
  const headerText = type === 'add' 
    ? tr('wizard.headers.add_cidr_pool') 
    : tr('wizard.headers.edit_cidr_pool');
  // prettier-ignore
  const buttonText = type === 'add'
    ? tr('buttons.add')
    : tr('buttons.edit');

  const handleSubmit = () => {
    // Get the pool from the staging state
    onSubmit(dummyCidrPoolNode.get(staging));
  };

  useEffect(() => dummyCidrPoolNode.set(staging, initialValue), [visible]);

  return (
    <Modal
      visible={visible}
      header={<Header variant="h3">{headerText}</Header>}
      footer={
        <Button variant="primary" onClick={handleSubmit}>
          {buttonText}
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
        {/* Use staging state to create the new pool in */}
        <WizardField state={staging} node={dummyCidrPoolNode} />
      </form>
    </Modal>
  );
});
