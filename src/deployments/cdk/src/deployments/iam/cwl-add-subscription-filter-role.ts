import * as c from '@aws-accelerator/common-config/src';
import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnIamRoleOutput } from './outputs';
import { Account } from '../../utils/accounts';

export interface CwlAddSubscriptionFilterRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
}

export async function createCwlAddSubscriptionFilterRoles(props: CwlAddSubscriptionFilterRoleProps): Promise<void> {
  const { accountStacks, config, accounts } = props;
  const centralLoggingServices = config['global-options']['central-log-services'];
  for (const account of accounts) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key, centralLoggingServices.region);
    if (!accountStack) {
      console.error(
        `Not able to create stack for "${centralLoggingServices.account}" while creating role for CWL Central logging`,
      );
      continue;
    }
    // Create IAM Role for reading logs from stream and push to destination
    const role = new iam.Role(accountStack, 'CWLAddSubscriptionFilterRole', {
      roleName: createRoleName('CWL-Add-Subscription-Filter'),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:DeleteSubscriptionFilter',
          'logs:DescribeLogGroups',
          'logs:DescribeSubscriptionFilters',
          'logs:PutSubscriptionFilter',
          'logs:PutRetentionPolicy',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DeleteRetentionPolicy',
        ],
        resources: ['*'],
      }),
    );

    new CfnIamRoleOutput(accountStack, `CWLAddSubscriptionFilterRoleOutput`, {
      roleName: role.roleName,
      roleArn: role.roleArn,
      roleKey: 'CWLAddSubscriptionFilter',
    });
  }
}
