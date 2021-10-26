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

export interface IamSecurityHubRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
}

export async function createSecurityHubRoles(props: IamSecurityHubRoleProps): Promise<void> {
  const { accountStacks, accounts } = props;

  for (const account of accounts) {
    const accountStack = accountStacks.getOrCreateAccountStack(account.key);
    const securityHubRole = await createSecurityHubRole(accountStack);
    createIamRoleOutput(accountStack, securityHubRole, 'SecurityHubRole');
  }
}

export async function createSecurityHubRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::SecurityHubRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  // iam:CreateServiceLinkedRole permission is required to create
  // AWSServiceRoleForSecurityHub role while enabling Security Hub
  // refer https://docs.aws.amazon.com/securityhub/latest/userguide/using-service-linked-roles.html
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['securityhub:*', 'iam:CreateServiceLinkedRole'],
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
