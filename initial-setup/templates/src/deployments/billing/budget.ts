import { CfnBudget } from '@aws-cdk/aws-budgets';
import { BudgetConfig, AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';

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

async function createBudget(accountStack: AcceleratorStack, budgetConfig: BudgetConfig): Promise<void> {
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
    const budgetProps = {
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
    };
    new CfnBudget(accountStack, budgetConfig.name, budgetProps);
  }
}

export async function step1(props: BudgetStep1Props) {
  const accountsAlreadyHaveBudget = [];
  const mandatoryAccountConfig = props.config.getMandatoryAccountConfigs();
  // Create dependency on Master account since budget requires Payer account deploy first
  const masterAccountStack = props.accountStacks.getOrCreateAccountStack('master');
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    if (accountKey !== 'master') {
      const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey);
      accountStack.addDependency(masterAccountStack);
    }
  }
  // Create Budgets for mandatory accounts
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    const budgetConfig = accountConfig.budget;
    if (budgetConfig) {
      const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey);
      await createBudget(accountStack, budgetConfig);

      accountsAlreadyHaveBudget.push(accountKey);
    }
  }
  // Create Budgets for rest accounts in OU
  for (const [ouKey, ouConfig] of props.config.getOrganizationalUnits()) {
    const budgetConfig = ouConfig['default-budgets'];
    if (budgetConfig) {
      for (const [accountKey, accountConfig] of props.config.getAccountConfigsForOu(ouKey)) {
        // only create if Budgets has not been created yet
        if (!accountsAlreadyHaveBudget.includes(accountKey)) {
          const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey);
          await createBudget(accountStack, budgetConfig);
        }
      }
    }
  }
}
