/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  FormField,
  Header,
  Input,
  Modal,
  SpaceBetween,
  StatusIndicator,
  Table,
} from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';
import { useInput } from '@/utils/hooks';
import { AcceleratorConfigurationNode } from '../configuration';
import { LabelWithDescription } from './label-with-description';

const organizationalUnitsNode = AcceleratorConfigurationNode.nested('organizational-units');

interface SimpleOrganizationalUnitValue {
  key: string;
  description: string;
  amount: number;
  email: string;
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
      };
    },
  );

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
    const { key, amount, email } = value;
    organizationalUnits[key] = { 'default-budgets': createInitialBudget(amount, email) };
  });

  const handleSubmitEdit = action((value: SubmitValue) => {
    // TODO Rename OU
    const { key, amount, email } = value;

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
  });

  const handleSubmit = action((value: SubmitValue) => {
    if (modalType === 'add') {
      handleSubmitAdd(value);
    } else {
      handleSubmitEdit(value);
    }
    setModalVisible(false);
  });

  const handleRemove = action(() => {
    const { key } = selectedItem ?? {};
    if (key) {
      delete organizationalUnits[key];
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
        ]}
        header={
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
    : tr('buttons.edit');

  const keyTitle = tr('wizard.labels.ou_key');
  const budgetAmountTitle = tr('wizard.labels.ou_default_per_account_budget');
  const budgetEmailTitle = tr('wizard.labels.ou_default_per_account_email');

  const handleSubmit = () => {
    onSubmit({
      key: ouKeyInputProps.value,
      amount: Number(budgetAmountInputProps.value),
      email: budgetEmailInputProps.value,
    });
  };

  useEffect(() => {
    ouKeyInputProps.setValue(initialValue.key ?? '');
    budgetAmountInputProps.setValue(`${initialValue.amount}`);
    budgetEmailInputProps.setValue(initialValue.email ?? '');
  }, [visible]);

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={<Header variant="h3">{headerText}</Header>}
      footer={
        <Button variant="primary" onClick={handleSubmit}>
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
            <Input {...ouKeyInputProps} disabled={type === 'edit'} />
          </FormField>
          <FormField label={budgetAmountTitle} stretch>
            <Input {...budgetAmountInputProps} type="number" />
          </FormField>
          <FormField label={budgetEmailTitle} stretch>
            <Input {...budgetEmailInputProps} />
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
