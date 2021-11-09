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
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormField,
  Grid,
  Header,
  Input,
  Modal,
  Select,
  SpaceBetween,
  StatusIndicator,
  Table,
  TokenGroup,
} from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';
import { useInput } from '@/utils/hooks';
import { AcceleratorConfigurationNode } from '../configuration';
import { LabelWithDescription } from './label-with-description';
import { OptionDefinition } from '../../../../node_modules/@awsui/components-react/internal/components/option/interfaces';

const organizationalUnitsNode = AcceleratorConfigurationNode.nested('organizational-units');

interface SimpleOrganizationalUnitValue {
  key: string;
  description: string;
  amount: number;
  email: string;
  type: string;
  scps: String[]; 
}

export interface OrganizationalUnitTableProps {
  state: any;
}

export const OrganizationalUnitTable = observer(({ state }: OrganizationalUnitTableProps) => {
  const { tr, currency } = useI18n();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'add' | 'edit'>('add');
  const [modalInitialValue, setModalInitialValue] = useState<Partial<SimpleOrganizationalUnitValue>>({});
  const [selectedItem, setSelectedItem] = useState<SimpleOrganizationalUnitValue | undefined>();
  const [permAlertVisible, setPermAlertVisible] = useState(false);
  const [dependencyAlertVisible, setDependencyAlertVisible] = useState(false);
  const [editNameAlert, setEditNameAlert] = useState(false);
  const [addNameAlert, setAddNameAlert] = useState(false);
  const [cannotAddOU, setCannotAddOU] = useState(false);

  const nameTitle = tr('wizard.labels.ou_name');
  const budgetAmountTitle = tr('wizard.labels.ou_default_per_account_budget');
  const budgetEmailTitle = tr('wizard.labels.ou_default_per_account_email');

  const organizationalUnits = organizationalUnitsNode.get(state) ?? {};

  // Map OUs to items that are easy to render
  const items: SimpleOrganizationalUnitValue[] = Object.entries(organizationalUnits).map(
    ([key, ouConfig]: [string, any]) => {
      const budgets = ouConfig?.['default-budgets'];
      return {
        key,
        description: ouConfig?.description,
        amount: budgets?.amount ?? 1000,
        email: budgets?.alerts?.[0]?.['emails']?.[0] ?? 'you@example.com',
        type: ouConfig?.type ?? "", 
        scps: ouConfig?.['scps'], 
      };
    },
  );

  const validateForm = (key: string, amount: number, email: string, type: string, scps: String[] ) => {
    console.log(amount)
    if (key == '' || key == null || Number.isNaN(amount) ||
        email == '' || type == '' || scps.length == 0) {
      return false
    } else {
      return true
    }
  }

  const handleAdd = () => {
    setModalType('add');
    setModalInitialValue({});
    setModalVisible(true);
  };

  const handleEdit = () => {
    setModalType('edit');
    setModalInitialValue(selectedItem ?? {});
    setModalVisible(true);
  };

  const handleSubmitAdd = action((value: SubmitValue) => {
    const { key, amount, email, type, scps } = value;
    if (nameExists(key)) {
      setAddNameAlert(true);
    } else if (validateForm(key, amount, email, type, scps)) {
      organizationalUnits[key] = { 
        'default-budgets': createInitialBudget(amount, email),
        'type': type,
        'scps': scps,
      };
    } else {
      setCannotAddOU(true);
    }
  });

  const handleSubmitEdit = action((value: SubmitValue) => {
    const { key, amount, email, origKey, type, scps } = value;

    if (key != origKey && nameExists(key)) {
      setEditNameAlert(true);
    } else if (key != origKey) {
      ouRecurs(key, origKey, state) 
    } 
    const budget = organizationalUnits[key]['default-budgets'];
    if (budget) {
      const alerts = budget?.alerts;
      budget.amount = amount;
      if (Array.isArray(alerts)) {
        alerts.forEach(alert => (alert.emails = [email]));
      }
    } else {
      organizationalUnits[key]['default-budgets'] = createInitialBudget(amount, email);
      
    }
    organizationalUnits[key]['scps'] = scps   
  });

  const nameExists = (editKey: string | undefined) => {
    for (let each in items) {
      if (items[each]['key'] == editKey) {
        return true;
      }
    }
    return false;
  }

  const ouRecurs = action((newValue: string, oldValue: string | undefined, node: any) => {
    Object.entries(node).forEach(([key, value]) => {
      if (key == oldValue) {
        node[newValue] = node[key]
        delete node[key]
      }
      if (typeof(value) != 'object') {
        if (Array.isArray(value)) {
          for (const each of value) {
            if (typeof(each == 'object'))
             ouRecurs(newValue, oldValue, each)
            } 
        } else {
          if ((key == 'ou' && node[key] == oldValue) || 
          (key == 'name' && node[key] == oldValue)) {
            node[key] = newValue
          } 
          return
        }
      }
      ouRecurs(newValue, oldValue, value)
    })
  });

  const handleSubmit = action((value: SubmitValue) => {
    if (modalType === 'add') {
      handleSubmitAdd(value);
    } else {
      handleSubmitEdit(value);
    } 
    setModalVisible(false);
  });

  const checkDependency = (ouName: string, node: any) => {
    var dependencyExists = false;
   
    Object.entries(node).forEach(([key, value]) => {
      if (typeof(value) != 'object') {
        if (Array.isArray(value)) {
          for (const each of value) {
            if (typeof(each == 'object'))
            dependencyExists = dependencyExists || checkDependency(ouName, each)
            } 
        } else {
          if ((key == 'ou' && node[key] == ouName) || 
          (key == 'name' && node[key] == ouName)) {
            dependencyExists = true; 
            return true
          } 
          return dependencyExists
        }
      }
      dependencyExists = dependencyExists || checkDependency(ouName, value)
    })
    return dependencyExists
  };

  const handleRemove = action(() => {
    const { key } = selectedItem ?? {};
    if (organizationalUnits[String(key)]['gui-perm'] == true) {
      setPermAlertVisible(true);
    } else if (checkDependency(String(key), state) == true) {
      setDependencyAlertVisible(true);
    } else {
      delete organizationalUnits[String(key)];

    }
    setSelectedItem(undefined);
  });

  return (
    <>
      <AddModifyOrganizationalUnitModal
        type={modalType}
        visible={modalVisible}
        initialValue={modalInitialValue}
        onDismiss={() => setModalVisible(false)}
        onSubmit={handleSubmit}
      />
      <Table
        items={items}
        trackBy="key"
        selectionType="single"
        selectedItems={selectedItem ? [selectedItem] : []}
        onSelectionChange={e => setSelectedItem(e.detail.selectedItems?.[0])}
        columnDefinitions={[
          {
            header: nameTitle,
            cell: ({ key, description }) => <LabelWithDescription label={key} description={description} />,
          },
          {
            header: budgetEmailTitle,
            cell: ({ email }) => email,
          },
          {
            header: budgetAmountTitle,
            cell: ({ amount }) => <Box textAlign="right">{currency(amount)}</Box>,
          },
          {
            header: "Type of Organization",
            cell: ({ type }) => type,
          },
          {
            header: "Service Control Policies",
            cell: ({ scps }) => scps.join(", "),
          }
        ]}
        header={
          <>
          <Header
            variant="h2"
            counter={`(${items.length})`}
            description={tr('wizard.headers.organizational_units_desc')}
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
            {tr('wizard.headers.organizational_units')}
          </Header>
          { 
           cannotAddOU === true && 
             <Alert
               onDismiss={() => setCannotAddOU(false)}
               visible={cannotAddOU}
               dismissible
               type="error"
               dismissAriaLabel="Close alert"
               header="Can't add new Organizational Unit"
             >
             Fields cannot be left empty when adding a new Organizational Unit. 
             </Alert>
          }
          { 
            permAlertVisible === true && 
              <Alert
                onDismiss={() => setPermAlertVisible(false)}
                visible={permAlertVisible}
                dismissible
                type="error"
                dismissAriaLabel="Close alert"
                header="This has been marked as a non-removable organizational unit in the configuration file."
              >
              Review the configuration file and remove the "gui-perm" field under the organizational unit if you would like to change this. 
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
                header="Cannot remove this organizational unit due to dependency"
              >
              There are other sections of your configuration that depend on this organizational unit. Remove those dependencies first
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
                header="Unsuccessful name change for Organizational Unit"
              >
              You cannot rename an OU to an already existing OU name. 
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
                header="Unable to add Organizational Unit"
              >
              You cannot add an OU with the same name of an already existing OU. 
              </Alert>
          }
          </>
        }
        footer={
          <SpaceBetween size="m">
            <StatusIndicator type="info">{tr('wizard.labels.ou_name_email_change_text')}</StatusIndicator>
            <StatusIndicator type="info">{tr('wizard.labels.ou_email_uniqueness_text')}</StatusIndicator>
          </SpaceBetween>
        }
      />
    </>
  );
});

interface SubmitValue {
  key: string;
  amount: number;
  email: string;
  origKey: string | undefined;
  type: string;
  scps: String[];
}

interface AddModifyOrganizationalUnitModalProps {
  type: 'add' | 'edit';
  visible: boolean;
  initialValue: Partial<SimpleOrganizationalUnitValue>;
  onDismiss: () => void;
  onSubmit: (value: SubmitValue) => void;
}

/**
 * Custom renderer for OU budget configuration.
 */
const AddModifyOrganizationalUnitModal = ({
  type,
  visible,
  initialValue,
  onDismiss,
  onSubmit,
}: AddModifyOrganizationalUnitModalProps) => {
  const { tr } = useI18n();
  const ouKeyInputProps = useInput();
  const budgetAmountInputProps = useInput();
  const budgetEmailInputProps = useInput();

  // prettier-ignore
  const headerText = type === 'add' 
    ? tr('wizard.headers.add_organizational_unit') 
    : tr('wizard.headers.edit_organizational_unit');
  // prettier-ignore
  const buttonText = type === 'add'
    ? tr('buttons.add')
    : tr('buttons.save_changes');

  const keyTitle = tr('wizard.labels.ou_key');
  const budgetAmountTitle = tr('wizard.labels.ou_default_per_account_budget');
  const budgetEmailTitle = tr('wizard.labels.ou_default_per_account_email');

  const orgType = { title: 'Type of Organization', description: '\
  Mandatory for core accounts, Workload for workload accounts, or Ignore for Organizational Management account'}
  const scpsTitle = { title: 'Service control policies (SCPs)', description: '' }

  var populatedScpList: any[]= []

  const populateScpList = () => {
    for (const each in initialValue.scps) {
      populatedScpList.push(
        { 
          label: initialValue.scps[parseInt(each)], 
          dismissLabel:  initialValue.scps[parseInt(each)]
        }
      )
    }
  }

  const [selectedOption, setSelectedOption] = useState<OptionDefinition>({ label: "Mandatory", value: "mandatory" });
  const [scpList, setScpList] = useState<any[]>([]);
  const [newScp, setNewScp] = useState("");

  const configScpList = (scps: any[]) => {
    var configScpList = []
    for (let each in scps) {
      configScpList.push(scps[each].label)
    }
    return configScpList
  }
  const handleSubmit = () => {  
      onSubmit({
        key: ouKeyInputProps.value,
        amount: Number(budgetAmountInputProps.value),
        email: budgetEmailInputProps.value,
        origKey: initialValue.key,
        type: String(selectedOption.value) ?? '',
        scps: configScpList(scpList)
      });
  };

  useEffect(() => {
    ouKeyInputProps.setValue(initialValue.key ?? '');
    budgetAmountInputProps.setValue(`${initialValue.amount}`);
    budgetEmailInputProps.setValue(initialValue.email ?? '');
    populateScpList()
    setScpList([...populatedScpList])
   
  }, [visible]);

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={<Header variant="h3">{headerText}</Header>}
      footer={
        <Button variant="primary" className="float-button" onClick={handleSubmit}>
          {buttonText}
        </Button>
      }
    >
      <form
        onSubmit={event => {
          event.stopPropagation();
          event.preventDefault();
          handleSubmit();
        }}
      >
        
        <SpaceBetween size="m">
          <FormField label={keyTitle} stretch>
            <Input {...ouKeyInputProps}/>
          </FormField>
          <FormField label={budgetAmountTitle} stretch>
            <Input {...budgetAmountInputProps} type="number" />
          </FormField>
          <FormField label={budgetEmailTitle} stretch>
            <Input {...budgetEmailInputProps} />
          </FormField>
          <FormField label={orgType.title} description={orgType.description} stretch>
          <Select
              selectedOption={selectedOption}
              onChange={({ detail }) =>
                setSelectedOption(detail.selectedOption)
              }
              options={[
              { label: "Mandatory", value: "mandatory" },
              { label: "Workload", value: "workload" },
              { label: "Ignore", value: "ignore" },]}
              selectedAriaLabel="Selected"
            />
          </FormField>
          <FormField label={scpsTitle.title} description={scpsTitle.description} stretch>
          <SpaceBetween size="xs">
            <TokenGroup
              onDismiss={({ detail: { itemIndex } }) => {
                setScpList([
                  ...scpList.slice(0, itemIndex),
                  ...scpList.slice(itemIndex + 1)
                ]);
              }}
              items={scpList}
            />
            <Grid
              gridDefinition={[{ colspan: 9 }, { colspan: 3 }]}
            >
              <div> 
                <Input
                  onChange={({ detail }) => setNewScp(detail.value)}
                  value={newScp}
                />
              </div>
              <div>
                <Button 
                  variant="normal" 
                  formAction="none"
                  onClick={
                    () => {
                      scpList.push({label: newScp, dismissLabel: "Remove item"})
                      setScpList([...scpList])
                  }}
                  >Add SCP</Button>
              </div>
            </Grid>
          </SpaceBetween>
          </FormField>
        </SpaceBetween>
      </form>
    </Modal>
  );
};

export function createInitialBudget(amount: number, email: string) {
  return {
    name: 'Budget',
    period: 'Monthly',
    amount,
    include: [
      'Upfront-reservation-fees',
      'Recurring-reservation-charges',
      'Other-subscription-costs',
      'Taxes',
      'Support-charges',
      'Discounts',
    ],
    alerts: [
      {
        type: 'Actual',
        'threshold-percent': 50,
        emails: [email],
      },
      {
        type: 'Actual',
        'threshold-percent': 75,
        emails: [email],
      },
      {
        type: 'Actual',
        'threshold-percent': 90,
        emails: [email],
      },
      {
        type: 'Actual',
        'threshold-percent': 100,
        emails: [email],
      },
    ],
  };
}
function organizationalUnits(organizationalUnits: any) {
  throw new Error('Function not implemented.');
}

