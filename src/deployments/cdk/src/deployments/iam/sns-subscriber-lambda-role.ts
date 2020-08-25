import * as c from '@aws-accelerator/common-config/src';
import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnIamRoleOutput } from './outputs';
import { Account } from '../../utils/accounts';

export interface CreateSnsSubscriberLambdaRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
}

export async function createSnsSubscriberLambdaRole(props: CreateSnsSubscriberLambdaRoleProps): Promise<void> {
  const { accountStacks, config, accounts } = props;
  const centralLoggingServices = config['global-options']['central-log-services'];
  const accountStack = accountStacks.tryGetOrCreateAccountStack(
    centralLoggingServices.account,
    centralLoggingServices.region,
  );
  if (!accountStack) {
    console.error(
      `Not able to create stack for "${centralLoggingServices.account}" while creating role for CWL Central logging`,
    );
    return;
  }

  // Create IAM Role for reading logs from stream and push to destination
  const role = new iam.Role(accountStack, 'SnsSubscriberLambdaRole', {
    roleName: createRoleName('SnsSubscriberLambda'),
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['sns:Publish', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );

  new CfnIamRoleOutput(accountStack, `SnsSubscriberLambdaOutput`, {
    roleName: role.roleName,
    roleArn: role.roleArn,
    roleKey: 'SnsSubscriberLambda',
  });
}
