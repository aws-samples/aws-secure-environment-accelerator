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
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { getVpcSharedAccountKeys } from '../../common/vpc-subnet-sharing';

export interface SSMDocumentProps {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
}

export async function createSSMDocumentRoles(props: SSMDocumentProps): Promise<void> {
  const { accountStacks, accounts } = props;
  const accountRoles: { [accountKey: string]: iam.IRole } = {};
  for (const account of accounts) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${account.key}`);
      continue;
    }
    const ssmRole = await ssmCreateDocumentRole(accountStack);
    accountRoles[account.key] = ssmRole;
    createIamRoleOutput(accountStack, ssmRole, 'SSMDocumentRole');
  }
}

export async function ssmCreateDocumentRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::CreateSSMDocument', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'ssm:DescribeDocument',
        'ssm:DeleteDocument',
        'ssm:UpdateDocumentDefaultVersion',
        'ssm:DescribeDocumentPermission',
        'ssm:UpdateDocument',
        'ssm:CreateDocument',
        'ssm:ModifyDocumentPermission',
        'ssm:GetDocument',
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
