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
