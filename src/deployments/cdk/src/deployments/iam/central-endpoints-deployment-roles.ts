import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { AcceleratorConfig, ResolversConfigType } from '@aws-accelerator/common-config/src';

export interface CreateCentralEndpointDeploymentRoleProps {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
}

export async function createCentralEndpointDeploymentRole(
  props: CreateCentralEndpointDeploymentRoleProps,
): Promise<void> {
  const { accountStacks, config } = props;
  const accountRoles: { [accountKey: string]: iam.IRole } = {};
  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (!vpcConfig['use-central-endpoints'] && !ResolversConfigType.is(vpcConfig.resolvers)) {
      continue;
    }
    if (accountRoles[accountKey]) {
      continue;
    }
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }
    const centralEndpointRole = await centralEndpointDeploymentRole(accountStack);
    accountRoles[accountKey] = centralEndpointRole;
    createIamRoleOutput(accountStack, centralEndpointRole, 'CentralEndpointDeployment');
  }
}

export async function centralEndpointDeploymentRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::CentralEndpointDeployment', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
      "route53resolver:ListResolverRules",
      "ec2:DescribeVpcs",
      "route53resolver:DeleteResolverRule",
      "route53resolver:AssociateResolverRule",
      "route53resolver:ListResolverRuleAssociations",
      "route53resolver:CreateResolverRule",
      "route53resolver:DisassociateResolverRule"],
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
