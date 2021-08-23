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
        'route53resolver:ListResolverRules',
        'ec2:DescribeVpcs',
        'route53resolver:DeleteResolverRule',
        'route53resolver:AssociateResolverRule',
        'route53resolver:ListResolverRuleAssociations',
        'route53resolver:CreateResolverRule',
        'route53resolver:DisassociateResolverRule',
        'route53resolver:UpdateResolverRule',
      ],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['route53:List*', 'route53:DeleteHostedZone', 'route53:CreateHostedZone'],
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
