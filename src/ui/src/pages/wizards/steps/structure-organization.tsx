/* eslint-disable @typescript-eslint/no-explicit-any */
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef } from 'react';
import * as c from '@aws-accelerator/config';
import * as t from '@aws-accelerator/common-types';
import { Checkbox, Container, FormField, Header, SpaceBetween } from '@awsui/components-react';
import { FieldProps, rawTypeEquals, TypeRenderer } from '@/components/fields/field';
import { AcceleratorConfigurationNode } from '../configuration';
import { extendWizardField, WizardField } from '../fields';
import { useEnableNode } from '../util';

export interface StructureOrganizationStepProps {
  configuration: any;
}

const organizationalUnitsNode = AcceleratorConfigurationNode.nested('organizational-units');
const mandatoryAccountConfigsNode = AcceleratorConfigurationNode.nested('mandatory-account-configs');
const workloadAccountConfigsNode = AcceleratorConfigurationNode.nested('workload-account-configs');

export const StructureOrganizationStep = observer(function StructureOrganizationStep({
  configuration,
}: StructureOrganizationStepProps) {
  /**
   * TODO
   * - {enumerate all accounts in config file, beside each put an x to delete, and pencil to rename, display OU, and email field:}
   * - {second line with account specific budget info – mandatory accounts only}
   * - {if account is in the mandatory-accounts section, disable delete icon, or changing ou}
   * - {add a new purpose field to the config file “purpose”: simply to display on screen}
   *    o Does this go on the line below, a little "i" button, or hover-over?)
   * - {if the config file has values for budget amounts, do not overwrite – only use this for values that were not supplied]
   */

  return (
    <SpaceBetween size="xxl">
      <Container header={<Header variant="h2">Organizational unit structure</Header>}>
        <CustomWizardField state={configuration} node={organizationalUnitsNode} FieldC={CustomWizardField} />
      </Container>
      <Container header={<Header variant="h2">Mandatory account structure</Header>}>
        <CustomWizardField
          state={configuration}
          node={mandatoryAccountConfigsNode}
          FieldC={CustomWizardField}
          context={{ mandatory: true }}
        />
      </Container>
      <Container header={<Header variant="h2">Workload account structure</Header>}>
        <CustomWizardField
          state={configuration}
          node={workloadAccountConfigsNode}
          FieldC={CustomWizardField}
          context={{ mandatory: false }}
        />
      </Container>
    </SpaceBetween>
  );
});

/**
 * Custom renderer for OU configuration that hides certain fields.
 */
const OuConfigurationComponent = (props: FieldProps<typeof c.OrganizationalUnitConfigType>) => {
  const { node, state } = props;
  const [, ouKey] = node.path;

  // TODO Rename OU
  return (
    <SpaceBetween size="m">
      {node.path.join('/')}
      <FormField label="Organizational unit budget">
        {/* Only show default budgets field */}
        <CustomWizardField state={state} node={node.nested('default-budgets')} />
      </FormField>
    </SpaceBetween>
  );
};

/**
 * Custom renderer for account configuration that hides certain fields.
 */
const AccountConfigurationComponent = observer(function AccountConfigurationComponent(
  props: FieldProps<typeof c.AccountConfigType>,
) {
  const { context, node, state } = props;
  const mandatory = context?.mandatory;

  const budgetNode = node.nested('budget');
  const [enable, handleEnableChange] = useEnableNode(budgetNode, state, createInitialBudget);

  // TODO Rename account
  return (
    <SpaceBetween size="m">
      {node.path.join('/')}
      <WizardField state={state} node={node.nested('account-name')} />
      <WizardField state={state} node={node.nested('email')} />
      <SpaceBetween size="s" direction="horizontal">
        <Checkbox
          checked={!enable}
          onChange={event => handleEnableChange(!event.detail.checked)}
          disabled={!mandatory}
        />
        <span>Use organizational unit budget</span>
      </SpaceBetween>
      {enable && <CustomWizardField {...props} state={state} node={budgetNode} />}
    </SpaceBetween>
  );
});

const BudgetComponent = observer((props: FieldProps<typeof c.BudgetConfigType>) => {
  const { node, state } = props;

  const amountNode = node.nested('amount');
  const alertsNode = node.nested('alerts');

  // Use the first email node in the first alert as the value to show
  const emailNode = alertsNode.nested(0).nested('emails').nested(0);
  const email = emailNode.get(state);

  // Set the email address in all alert nodes
  const isFirstEffect = useRef(true);
  useEffect(
    action(() => {
      // Skip updating the first render as nothing changed
      if (isFirstEffect.current) {
        isFirstEffect.current = false;
        return;
      }

      // Set the email address in all alert nodes
      const email = emailNode.get(state);
      const alerts = alertsNode.get(state);
      alerts.forEach((alert: any) => (alert.emails = [email]));
    }),
    [email],
  );

  return (
    <>
      <CustomWizardField node={amountNode} state={state} />
      <CustomWizardField node={emailNode} state={state} />
    </>
  );
});

function createInitialBudget() {
  return {
    name: 'Budget',
    period: 'Monthly',
    amount: 1000,
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
        emails: ['youremail@example.com'],
      },
      {
        type: 'Actual',
        'threshold-percent': 75,
        emails: ['youremail@example.com'],
      },
      {
        type: 'Actual',
        'threshold-percent': 90,
        emails: ['youremail@example.com'],
      },
      {
        type: 'Actual',
        'threshold-percent': 100,
        emails: ['youremail@example.com'],
      },
    ],
  };
}

/**
 * Field that renders wizard field and has a specific renderer for AccountConfiguration.
 */
const CustomWizardField: TypeRenderer<t.Any> = extendWizardField([
  {
    condition: rawTypeEquals(c.OrganizationalUnitConfigType),
    Renderer: OuConfigurationComponent,
  },
  {
    condition: rawTypeEquals(c.MandatoryAccountConfigType),
    Renderer: AccountConfigurationComponent,
  },
  {
    condition: rawTypeEquals(c.BudgetConfigType),
    Renderer: BudgetComponent,
  },
]);
