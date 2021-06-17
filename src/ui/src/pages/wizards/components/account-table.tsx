/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
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
import { useI18n } from '@/components/i18n-context';
import { useCheckboxInput, useInput } from '@/utils/hooks';
import { valueAsArray } from '@/utils';
import { AcceleratorConfigurationNode } from '../configuration';
import { isDisabled, setDisabled } from '../util';
import { LabelWithDescription } from './label-with-description';

interface SimpleAccountValue {
  key: string;
  description?: string;
  ou: string;
  name: string;
  email: string;
  budgetAmount: number;
  budgetEmail: string;
  useOuSettings: boolean;
}

export interface AccountTableProps {
  state: any;
  accountType: 'workload' | 'mandatory';
}

const mandatoryAccountConfigsNode = AcceleratorConfigurationNode.nested('mandatory-account-configs');
const workloadAccountConfigsNode = AcceleratorConfigurationNode.nested('workload-account-configs');

// TODO Get translations directly from a type instead of getting a dummy node
const dummyAccountNode = mandatoryAccountConfigsNode.nested('dummy');

export const AccountTable = observer(({ state, accountType }: AccountTableProps) => {
  const { tr, currency } = useI18n();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'add' | 'edit'>('add');
  const [modalInitialValue, setModalInitialValue] = useState<Partial<SimpleAccountValue>>({});
  const [selectedItem, setSelectedItem] = useState<SimpleAccountValue | undefined>(undefined);

  // TODO Get translations directly from a type instead of getting a dummy node
  const { title: nameTitle } = tr(dummyAccountNode.nested('account-name'));
  const { title: emailTitle } = tr(dummyAccountNode.nested('email'));
  const { title: ouTitle } = tr(dummyAccountNode.nested('ou'));

  const useOuSettingTitle = tr('wizard.labels.account_budget_use_ou');
  const budgetAmountTitle = tr('wizard.labels.account_budget_amount');
  const budgetEmailTitle = tr('wizard.labels.account_budget_email');

  const node = accountType === 'mandatory' ? mandatoryAccountConfigsNode : workloadAccountConfigsNode;
  const accounts = node.get(state) ?? {};

  // Map OUs to items that are easy to render
  const items: SimpleAccountValue[] = Object.entries(accounts).map(([key, accountConfig]: [string, any]) => {
    const budget = accountConfig?.budget;
    return {
      key,
      description: accountConfig?.description ?? '',
      ou: accountConfig?.ou ?? '',
      name: accountConfig?.['account-name'] ?? '',
      email: accountConfig?.email ?? '',
      budgetAmount: budget?.amount ?? 1000,
      budgetEmail: budget?.alerts?.[0]?.emails?.[0] ?? 'you@example.com',
      useOuSettings: budget === undefined || isDisabled(state, [...node.path, key]),
    };
  });

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

  const handleSubmitAdd = action((value: SimpleAccountValue) => {
    const { key, ou, name, budgetAmount: amount, budgetEmail: email, useOuSettings } = value;
    accounts[key] = {
      'account-name': name,
      ou,
      budget: createInitialBudget(amount, email),
    };

    // Disable the budget if the "use OU settings" field is checked
    setDisabled(state, [...node.path, key], useOuSettings ?? false);
  });

  const handleSubmitEdit = action((value: SimpleAccountValue) => {
    const { key, ou, name, budgetAmount: amount, budgetEmail: email, useOuSettings } = value;

    accounts[key]['ou'] = ou;
    accounts[key]['account-name'] = name;

    let budget = accounts[key]['budget'];
    if (budget) {
      budget.amount = amount;
      // Update alert email addresses
      valueAsArray(budget.alerts).forEach(alert => (alert.emails = [email]));
    } else {
      accounts[key]['budget'] = createInitialBudget(amount, email);
    }

    // Disable the budget if the "use OU settings" field is checked
    setDisabled(state, [...node.path, key], useOuSettings ?? false);
  });

  const handleSubmit = action((value: SimpleAccountValue) => {
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
      delete accounts[key];
    }
    setSelectedItem(undefined);
  });

  return (
    <>
      <AddModifyAccountModal
        type={modalType}
        accountType={accountType}
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
            cell: ({ name, description }) => <LabelWithDescription label={name} description={description} />,
          },
          {
            header: ouTitle,
            cell: ({ ou }) => ou,
          },
          {
            header: emailTitle,
            cell: ({ email }) => email,
          },
          {
            header: budgetEmailTitle,
            cell: ({ useOuSettings, budgetEmail }) =>
              useOuSettings ? <Badge className="nowrap">{useOuSettingTitle}</Badge> : budgetEmail,
          },
          {
            header: budgetAmountTitle,
            cell: ({ useOuSettings, budgetAmount: amount }) =>
              useOuSettings ? (
                <Box textAlign="right">
                  <Badge className="nowrap">{useOuSettingTitle}</Badge>
                </Box>
              ) : (
                <Box textAlign="right">{currency(amount)}</Box>
              ),
          },
        ]}
        header={
          <Header
            variant="h2"
            counter={`(${items.length})`}
            description={
              accountType === 'mandatory'
                ? tr('wizard.headers.mandatory_accounts_desc')
                : tr('wizard.headers.workload_accounts_desc')
            }
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
            {accountType === 'mandatory'
              ? tr('wizard.headers.mandatory_accounts')
              : tr('wizard.headers.workload_accounts')}
          </Header>
        }
        footer={
          <SpaceBetween size="m">
            <StatusIndicator type="info">{tr('wizard.labels.account_name_email_change_text')}</StatusIndicator>
            <StatusIndicator type="info">{tr('wizard.labels.account_email_uniqueness_text')}</StatusIndicator>
            <StatusIndicator type="info">{tr('wizard.labels.account_existing_account_text')}</StatusIndicator>
          </SpaceBetween>
        }
      />
    </>
  );
});

interface AddModifyAccountModalProps {
  accountType: 'workload' | 'mandatory';
  type: 'add' | 'edit';
  visible: boolean;
  initialValue: Partial<SimpleAccountValue>;
  onDismiss: () => void;
  onSubmit: (value: SimpleAccountValue) => void;
}

/**
 * Custom renderer for OU budget configuration.
 */
const AddModifyAccountModal = ({
  accountType,
  type,
  visible,
  initialValue,
  onDismiss,
  onSubmit,
}: AddModifyAccountModalProps) => {
  const { tr } = useI18n();
  const accountKeyInputProps = useInput();
  const accountNameInputProps = useInput();
  const emailInputProps = useInput();
  const ouInputProps = useInput();
  const useOuInputProps = useCheckboxInput();
  const budgetAmountInputProps = useInput();
  const budgetEmailInputProps = useInput();

  // prettier-ignore
  const headerText = type === 'add' 
    ? accountType === 'mandatory' ? tr('wizard.headers.add_mandatory_account')  :  tr('wizard.headers.add_workload_account') 
    : accountType === 'mandatory' ?tr('wizard.headers.edit_mandatory_account'): tr('wizard.headers.edit_workload_account');
  // prettier-ignore
  const buttonText = type === 'add'
    ? tr('buttons.add')
    : tr('buttons.edit');

  const { title: nameTitle, description: nameDesc } = tr(dummyAccountNode.nested('account-name'));
  const { title: emailTitle, description: emailDesc } = tr(dummyAccountNode.nested('email'));
  const { title: ouTitle, description: ouDesc } = tr(dummyAccountNode.nested('ou'));

  const keyTitle = tr('wizard.labels.account_key');
  const useOuSettingTitle = tr('wizard.labels.account_budget_use_ou');
  const budgetAmountTitle = tr('wizard.labels.account_budget_amount');
  const budgetEmailTitle = tr('wizard.labels.account_budget_email');

  const handleSubmit = () => {
    onSubmit({
      key: accountKeyInputProps.value,
      ou: ouInputProps.value,
      name: accountNameInputProps.value,
      email: budgetEmailInputProps.value,
      useOuSettings: useOuInputProps.checked,
      budgetAmount: Number(budgetAmountInputProps.value),
      budgetEmail: budgetEmailInputProps.value,
    });
  };

  useEffect(() => {
    accountKeyInputProps.setValue(initialValue.key ?? '');
    accountNameInputProps.setValue(initialValue.name ?? '');
    emailInputProps.setValue(initialValue.email ?? '');
    ouInputProps.setValue(initialValue.ou ?? '');
    useOuInputProps.setChecked(initialValue.useOuSettings ?? false);
    budgetAmountInputProps.setValue(`${initialValue.budgetAmount}`);
    budgetEmailInputProps.setValue(initialValue.budgetEmail ?? '');
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
            <Input {...accountKeyInputProps} disabled={type === 'edit'} />
          </FormField>
          <FormField label={nameTitle} description={nameDesc} stretch>
            <Input {...accountNameInputProps} />
          </FormField>
          <FormField label={emailTitle} description={emailDesc} stretch>
            <Input {...emailInputProps} />
          </FormField>
          <FormField label={ouTitle} description={ouDesc} stretch>
            <Input {...ouInputProps} />
          </FormField>
          <FormField label={useOuSettingTitle} stretch>
            <Checkbox {...useOuInputProps} />
          </FormField>
          <FormField label={budgetAmountTitle} stretch>
            <Input {...budgetAmountInputProps} disabled={useOuInputProps.checked} type="number" />
          </FormField>
          <FormField label={budgetEmailTitle} stretch>
            <Input {...budgetEmailInputProps} disabled={useOuInputProps.checked} />
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
