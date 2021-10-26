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
