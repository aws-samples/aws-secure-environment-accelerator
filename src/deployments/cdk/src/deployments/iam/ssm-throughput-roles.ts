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

export interface CreateSsmThroughputRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
}

export async function createSsmThroughputRole(props: CreateSsmThroughputRoleProps): Promise<void> {
  const { accountStacks, accounts } = props;
  for (const account of accounts) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!accountStack) {
      console.warn(`Unable to create Account Stack for Account "${account.key}"`);
      continue;
    }
    const iamRole = await createRole(accountStack);
    createIamRoleOutput(accountStack, iamRole, 'SSMUpdateRole');
  }
}

async function createRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::SSMUpdateRole', {
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
      actions: ['ssm:GetServiceSetting'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['ssm:UpdateServiceSetting', 'ssm:ResetServiceSetting'],
      resources: [`arn:aws:ssm:*:${cdk.Aws.ACCOUNT_ID}:servicesetting/ssm/parameter-store/high-throughput-enabled`],
    }),
  );
  return role;
}
