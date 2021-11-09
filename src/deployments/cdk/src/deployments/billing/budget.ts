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

import { Budget } from '@aws-accelerator/cdk-constructs/src/billing';
import { BudgetConfig, AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks, AccountStack } from '../../common/account-stacks';

export interface BudgetStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
}

export enum CostTypes {
  CREDIT = 'Credits',
  DISCOUNT = 'Discounts',
  OTHER = 'Other-subscription-costs',
  RECURRING = 'Recurring-reservation-charges',
  REFUND = 'Refunds',
  SUBSCRIPTION = 'Subscription',
  SUPPORT = 'Support-charges',
  TAX = 'Taxes',
  UPFRONT = 'Upfront-reservation-fees',
  AMORTIZED = 'Amortized',
  BLENDED = 'Blended',
}

async function convertCostTypes(budgetConfig: BudgetConfig) {
  const include = budgetConfig.include;
  return {
    includeCredit: include.includes(CostTypes.CREDIT),
    includeDiscount: include.includes(CostTypes.DISCOUNT),
    includeOtherSubscription: include.includes(CostTypes.OTHER),
    includeRecurring: include.includes(CostTypes.RECURRING),
    includeRefund: include.includes(CostTypes.REFUND),
    includeSubscription: include.includes(CostTypes.SUBSCRIPTION),
    includeSupport: include.includes(CostTypes.SUPPORT),
    includeTax: include.includes(CostTypes.TAX),
    includeUpfront: include.includes(CostTypes.UPFRONT),
    useAmortized: include.includes(CostTypes.AMORTIZED),
    useBlended: include.includes(CostTypes.BLENDED),
  };
}

async function createBudget(accountStack: AccountStack, budgetConfig: BudgetConfig): Promise<void> {
  if (budgetConfig) {
    const notifications = [];
    for (const notification of budgetConfig.alerts) {
      notifications.push({
        notification: {
          comparisonOperator: 'GREATER_THAN',
          notificationType: notification.type.toUpperCase(),
          threshold: notification['threshold-percent'],
          thresholdType: 'PERCENTAGE',
        },
        subscribers: notification.emails.map(email => ({
          address: email,
          subscriptionType: 'EMAIL',
        })),
      });
    }

    new Budget(accountStack, budgetConfig.name, {
      budget: {
        budgetName: budgetConfig.name,
        budgetLimit: {
          amount: budgetConfig.amount,
          unit: 'USD',
        },
        budgetType: 'COST',
        timeUnit: budgetConfig.period.toUpperCase(),
        costTypes: await convertCostTypes(budgetConfig),
      },
      notificationsWithSubscribers: notifications,
    });
  }
}

/**
 * This step creates the budgets for the master stack. The master budgets need to be created first.
 */
export async function step1(props: BudgetStep1Props) {
  const masterAccountKey = props.config.getMandatoryAccountKey('master');
  const masterConfig = props.config.getAccountByKey(masterAccountKey);

  const budgetConfig = masterConfig.budget;
  if (budgetConfig) {
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey);
    await createBudget(masterAccountStack, budgetConfig);
  }
}

/**
 * This step creates the additional budgets for the account stacks.
 */
export async function step2(props: BudgetStep1Props) {
  const masterAccountKey = props.config.getMandatoryAccountKey('master');
  const accountsAlreadyHaveBudget = [masterAccountKey];

  // Create Budgets for mandatory accounts
  for (const [accountKey, accountConfig] of props.config.getAccountConfigs()) {
    const budgetConfig = accountConfig.budget;
    if (budgetConfig) {
      const accountStack = props.accountStacks.tryGetOrCreateAccountStack(accountKey);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }
      if (!accountsAlreadyHaveBudget.includes(accountKey)) {
        await createBudget(accountStack, budgetConfig);
        accountsAlreadyHaveBudget.push(accountKey);
      }
    }
  }

  // Create Budgets for rest accounts in OU
  for (const [ouKey, ouConfig] of props.config.getOrganizationalUnits()) {
    const budgetConfig = ouConfig['default-budgets'];
    if (budgetConfig) {
      for (const [accountKey, _] of props.config.getAccountConfigsForOu(ouKey)) {
        // only create if Budgets has not been created yet
        if (!accountsAlreadyHaveBudget.includes(accountKey)) {
          const accountStack = props.accountStacks.tryGetOrCreateAccountStack(accountKey);
          if (!accountStack) {
            console.warn(`Cannot find account stack ${accountKey}`);
            continue;
          }
          await createBudget(accountStack, budgetConfig);
        }
      }
    }
  }
}
