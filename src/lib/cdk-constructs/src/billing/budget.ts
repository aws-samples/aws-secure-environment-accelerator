import hashSum from 'hash-sum';
import * as cdk from '@aws-cdk/core';
import * as budgets from '@aws-cdk/aws-budgets';

export interface BudgetProps {
  readonly budget: budgets.CfnBudget.BudgetDataProperty;
  readonly notificationsWithSubscribers: budgets.CfnBudget.NotificationWithSubscribersProperty[];
}

/**
 * Wrapper around CfnBudget. The construct adds a hash to the budget name that is based on the budget properties.
 * The hash makes sure the budget gets replaced correctly by CloudFormation.
 */
export class Budget extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: BudgetProps) {
    super(scope, id);

    const hash = hashSum({ ...props, path: this.node.path });
    const budgetName = props.budget.budgetName ? `${props.budget.budgetName}-${hash}` : undefined;

    new budgets.CfnBudget(this, 'Resource', {
      budget: {
        ...props.budget,
        budgetName,
      },
      notificationsWithSubscribers: props.notificationsWithSubscribers,
    });
  }
}
