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

import * as iam from 'aws-cdk-lib/aws-iam';
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
