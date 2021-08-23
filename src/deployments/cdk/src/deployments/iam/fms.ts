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
import * as cdk from '@aws-cdk/core';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import * as c from '@aws-accelerator/common-config';

export interface CreateFmsCustomResourceRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

export async function createFmsCustomResourceRole(props: CreateFmsCustomResourceRoleProps): Promise<void> {
  const { accountStacks, config } = props;
  const centralSecurityConfig = config['global-options']['central-security-services'];
  const accountStack = accountStacks.tryGetOrCreateAccountStack(centralSecurityConfig.account);
  if (!accountStack) {
    console.warn(`Unable to create Account Stack for Account "${centralSecurityConfig.account}"`);
    return;
  }
  const iamRole = await createRole(accountStack);
  createIamRoleOutput(accountStack, iamRole, 'FmsCustomResourceRole');
}

async function createRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::FmsCustomResourceRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['fms:PutNotificationChannel', 'fms:DeleteNotificationChannel', 'iam:PassRole'],
      resources: ['*'],
    }),
  );
  return role;
}
