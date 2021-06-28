import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import * as c from '@aws-accelerator/common-config/src';

export interface Ec2OperationsRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
}

export async function createEc2OperationsRoles(props: Ec2OperationsRoleProps): Promise<void> {
  const { accountStacks, accounts } = props;

  for (const account of accounts) {
    const accountStack = accountStacks.getOrCreateAccountStack(account.key);
    const securityHubRole = await createTgwRole(accountStack);
    createIamRoleOutput(accountStack, securityHubRole, 'Ec2Operations');
  }
}

async function createTgwRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::Ec2Operations', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'ec2:DescribeTransitGatewayVpcAttachments',
        'ec2:ModifyTransitGatewayVpcAttachment',
        'ec2:ModifyVpcEndpointServicePermissions',
        'ec2:AcceptVpcEndpointConnections',
      ],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}
