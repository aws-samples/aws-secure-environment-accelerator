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
import { Alert, Button, FormField, Header, Input, Modal, Select, SpaceBetween, StatusIndicator, Table } from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';
import { valueAsArray } from '@/utils';
import { AcceleratorConfigurationNode } from '../configuration';
import { WizardField } from './fields';
import { LabelWithDescription } from './label-with-description';
import { useInput } from '@/utils/hooks';
import { OptionDefinition } from '../../../../node_modules/@awsui/components-react/internal/components/option/interfaces';

const cidrPoolsNode = AcceleratorConfigurationNode.nested('global-options').nested('cidr-pools');


const dummyCidrPoolNode = cidrPoolsNode.nested(0);

interface SimpleCidrPoolUnitValue {
  cidr: string;
  pool: string;
  description: string;
  region: string;
  origPoolName: string;
}

export interface CidrPoolTableProps {
  state: any;
}

export const CidrPoolTable: React.VFC<CidrPoolTableProps> = observer(({ state }) => {
  const { tr } = useI18n();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'add' | 'edit'>('add');
  const [modalInitialValue, setModalInitialValue] = useState<any>({});
  const [selectedItem, setSelectedItem] = useState<any>();
  const [dependencyAlertVisible, setDependencyAlertVisible] = useState(false);
  const [editNameAlert, setEditNameAlert] = useState(false);
  const [addNameAlert, setAddNameAlert] = useState(false);
  const [cannotAddCIDR, setCannotAddCIDR] = useState(false);

  // Fetch translations to be used as table headers
  const { title: nameTitle } = tr(dummyCidrPoolNode.nested('pool'));
  const { title: cidrTitle } = tr(dummyCidrPoolNode.nested('cidr'));
  const { title: regionTitle } = tr(dummyCidrPoolNode.nested('region'));

  const cidrPoolsNodeState = cidrPoolsNode.get(state) ?? {}

  const cidrPoolList: SimpleCidrPoolUnitValue[] = Object.entries(cidrPoolsNodeState).map(
    ([key, cidrConfig]: [string, any]) => {
      return {
        cidr: cidrConfig?.cidr,
        pool: cidrConfig?.pool,
        description: cidrConfig?.description,
        region: cidrConfig?.region,
        origPoolName: cidrConfig?.pool
      };
    },
  );

  const pools = valueAsArray(cidrPoolsNode.get(state));

  const handleAdd = action(() => {
    setModalType('add');
    setModalInitialValue({});
    setModalVisible(true);
  });

  const handleEdit = action(() => {
    setModalType('edit');
    setModalInitialValue(selectedItem ? toJS(selectedItem) : {});
    setModalVisible(true);
  });

  const nameExists = (pool: string | undefined) => {
    for (let each in pools) {
      if (pools[each]['pool'] == pool) {
        return true;
      }
    }
    return false;
  }

  const validateForm = (cidr: string, pool: string, description: string, region: String) => {
    if (cidr == "" || pool == "" || description == "" || region == "") {
      return false
    } else {
      return true
    }
  }

  const handleSubmitAdd = action((value: SimpleCidrPoolUnitValue) => {
    const {cidr, pool, description, region, origPoolName} = value; 

    if (nameExists(pool)) {
      setAddNameAlert(true);
    } else if (validateForm(cidr, pool, description, region)) {
      cidrPoolsNodeState.push(
          {
            cidr: cidr, 
            pool: pool,
            region: region, 
            description: description,
            origPoolName: pool,
          }
      )
    } else {
      setCannotAddCIDR(true);
    }


    /*if (nameExists(value['pool'])) {
  
    } else {
      cidrPoolsNode.set(state, [...pools, value]);
    }*/
  });


  const handleSubmitEdit = action((value: SimpleCidrPoolUnitValue) => {
    const {cidr, pool, description, region, origPoolName} = value; 

    if(pool !== origPoolName) {
      if (nameExists(pool)) {
        setEditNameAlert(true);
        return;
      } else {
        cidrRecurs(selectedItem.pool, value.pool, state) 
      }
    }
    let index = 0; 
    for (let each in cidrPoolList) {
      if (cidrPoolList[each].pool == selectedItem.pool) {
        index = parseInt(each)
      }
    }
    cidrPoolsNodeState[index] = 
      {
        cidr: cidr, 
        pool: pool,
        region: region, 
        description: description,
      }
  });

  const cidrRecurs = action((oldValue: string, newValue: string, node: any) => {
    Object.entries(node).forEach(([key, value]) => {
      if (typeof(value) != 'object') {
        if (Array.isArray(value)) {
          for (const each of value) {
            if (typeof(each == 'object'))
              cidrRecurs(oldValue, newValue, each)
            } 
        } else {
          if (key == 'pool' && node[key] == oldValue) {
           node[key] = newValue
          }
          return
        }
      }
      cidrRecurs(oldValue, newValue, value)
    })
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
    if (checkDependency(selectedItem?.pool, state)) {
      setDependencyAlertVisible(true);
    } else {
      const newPools = pools.filter(pool => selectedItem?.pool !== pool.pool);
      cidrPoolsNode.set(state, newPools); 
    }
    setSelectedItem(undefined);
  });

  const checkDependency = (cidrName: string, node: any) => {
    var dependencyExists = false;
    Object.entries(node).forEach(([key, value]) => {
      if (key == 'global-options') {
        return;
      } 
      if (typeof(value) != 'object') {
        if (Array.isArray(value)) {
          for (const each of value) {
            if (typeof(each == 'object'))
            dependencyExists = dependencyExists || checkDependency(cidrName, each)
            } 
        } else {
          if (key == 'pool' && node[key] == cidrName) {
            dependencyExists = true; 
            return true
          } 
          return dependencyExists
        }
      }
      dependencyExists = dependencyExists || checkDependency(cidrName, value)
    })
    return dependencyExists
  };

  return (
    <>
      <AddCidrPoolModal
        type={modalType}
        visible={modalVisible}
        initialValue={modalInitialValue}
        onDismiss={() => setModalVisible(false)}
        onSubmit={handleSubmit}
        state={state}
      />
      <Table
        items={cidrPoolList}
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
          <>
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
          { 
           cannotAddCIDR === true && 
             <Alert
               onDismiss={() => setCannotAddCIDR(false)}
               visible={cannotAddCIDR}
               dismissible
               type="error"
               dismissAriaLabel="Close alert"
               header="Can't add new CIDR Pool"
             >
             Fields cannot be left empty when adding a new CIDR Pool. 
             </Alert>
          }
          { 
            dependencyAlertVisible === true && 
              <Alert
                onDismiss={() => setDependencyAlertVisible(false)}
                visible={dependencyAlertVisible}
                dismissible
                type="error"
                dismissAriaLabel="Close alert"
                header="Cannot remove this CIDR pool due to dependency"
              >
              There are other sections of your configuration that depend on this CIDR pool. Remove those dependencies first
              and try again. 
              </Alert>
          }
          { 
            editNameAlert === true && 
              <Alert
                onDismiss={() => setEditNameAlert(false)}
                visible={editNameAlert}
                dismissible
                type="error"
                dismissAriaLabel="Close alert"
                header="Unsuccessful name change for CIDR pool"
              >
              You cannot rename a CIDR pool to an already existing CIDR pool.
              . 
              </Alert>
          }
          { 
            addNameAlert === true && 
              <Alert
                onDismiss={() => setAddNameAlert(false)}
                visible={addNameAlert}
                dismissible
                type="error"
                dismissAriaLabel="Close alert"
                header="Unable to add CIDR pool"
              >
              You cannot add a CIDR pool with the same name of an already existing CIDR pool. 
              </Alert>
          }
          </>
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
  state: any;
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
  state
}: AddCidrPoolModalProps) {
  const { tr } = useI18n();
  //const staging = useLocalStore(() => ({}));
  const cidrPoolNameInputProps = useInput();
  const cidrPoolSizeInputProps = useInput();
  const cidrPoolDescInputProps = useInput();

  // prettier-ignore
  const headerText = type === 'add' 
    ? tr('wizard.headers.add_cidr_pool') 
    : tr('wizard.headers.edit_cidr_pool');
  // prettier-ignore
  const buttonText = type === 'add'
    ? tr('buttons.add')
    : tr('buttons.save_changes');

  const { title: nameTitle, description: nameDesc } = tr(dummyCidrPoolNode.nested('pool'));
  const { title: cidrTitle, description: cidrDesc } = tr(dummyCidrPoolNode.nested('cidr'));
  const { title: regionTitle, description: regionDesc } = tr(dummyCidrPoolNode.nested('region'));
  const { title: descTitle, description: descDesc } = tr(dummyCidrPoolNode.nested('description'));
  const [selectedOption, setSelectedOption] = useState<OptionDefinition>({ label: "", value: "" });

  const regionsNode = AcceleratorConfigurationNode.nested('global-options').nested('supported-regions');
  const regionsNodeState = regionsNode.get(state) ?? {}

  var options: { label: string; value: string; }[] = []
  const populateSelect = () => {
    for (const each in regionsNodeState) {
      options.push({label: regionsNodeState[each], value: regionsNodeState[each]})
    }
  }

  const handleSubmit = () => {
    onSubmit({
      cidr: cidrPoolSizeInputProps.value ?? '',
      pool: cidrPoolNameInputProps.value ?? '', 
      description: cidrPoolDescInputProps.value ?? '',
      region: String(selectedOption.value) ?? '',
      origPoolName: initialValue.pool
    });
  };

  /*useEffect(() => dummyCidrPoolNode.set(staging, initialValue), [visible]);*/
  useEffect(() => {
    cidrPoolNameInputProps.setValue(initialValue.pool ?? '');
    cidrPoolSizeInputProps.setValue(initialValue.cidr ?? '');
    cidrPoolDescInputProps.setValue(initialValue.description ?? '');
    setSelectedOption({ label: initialValue.region ?? '', value: initialValue.region ?? ''});
  }, [visible]);

  return (
    <Modal
      visible={visible}
      header={<Header variant="h3">{headerText}</Header>}
      footer={
        <Button variant="primary" className="float-button" onClick={handleSubmit}>
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
        {populateSelect()}
        <SpaceBetween size="m">
          <FormField label={nameTitle} description={nameDesc} stretch>
            <Input {...cidrPoolNameInputProps}/>
          </FormField>
          <FormField label={cidrTitle} description={cidrDesc} stretch>
            <Input {...cidrPoolSizeInputProps} />
          </FormField>
          <FormField label={regionTitle} description={regionDesc} stretch>
            <Select
              selectedOption={selectedOption}
              onChange={({ detail }) =>
                setSelectedOption(detail.selectedOption)
              }
              options={options}
              selectedAriaLabel="Selected"
            />
          </FormField>

          <FormField label={descTitle} description={descDesc} stretch>
            <Input {...cidrPoolDescInputProps} />
          </FormField>
          </SpaceBetween>
      </form>

        {/* Use staging state to create the new pool in 
        <WizardField state={staging} node={dummyCidrPoolNode.nested('pool')} />
        <WizardField state={staging} node={dummyCidrPoolNode.nested('cidr')} />
        <WizardField state={staging} node={dummyCidrPoolNode.nested('region')} />
        <WizardField state={staging} node={dummyCidrPoolNode.nested('description')} />*/}
    </Modal>
  );
});
