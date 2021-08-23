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

export interface S3PutReplicationRoleProps {
  accountStacks: AccountStacks;
  accounts: Account[];
}

export async function createS3PutReplicationRole(props: S3PutReplicationRoleProps): Promise<void> {
  const { accountStacks, accounts } = props;

  for (const account of accounts) {
    const accountStack = accountStacks.getOrCreateAccountStack(account.key);
    const iamRole = await createRole(accountStack);
    createIamRoleOutput(accountStack, iamRole, 'S3PutReplicationRole');
  }
}

async function createRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::S3PutReplicationRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'iam:PassRole',
        'logs:CreateLogStream',
        'logs:CreateLogGroup',
        'logs:PutLogEvents',
        's3:PutLifecycleConfiguration',
        's3:PutReplicationConfiguration',
        's3:PutBucketVersioning',
      ],
      resources: ['*'],
    }),
  );
  return role;
}
