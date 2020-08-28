import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import * as c from '@aws-accelerator/common-config/src';

export interface IamTgwCreatePeeringRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

export async function createTgwPeeringRoles(props: IamTgwCreatePeeringRoleProps): Promise<void> {
  const { accountStacks, config } = props;

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const tgwConfigs = accountConfig.deployments?.tgw;
    if (!tgwConfigs || tgwConfigs.length === 0) {
      continue;
    }

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    const securityHubRole = await createTgwRole(accountStack);
    createIamRoleOutput(accountStack, securityHubRole, 'TgwCreatePeeringRole');
  }
}

async function createTgwRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::TGWCreatePeeringAttachment', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'ec2:CreateTransitGatewayPeeringAttachment',
        'ec2:DeleteTransitGatewayPeeringAttachment',
        'ec2:CreateTags',
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
