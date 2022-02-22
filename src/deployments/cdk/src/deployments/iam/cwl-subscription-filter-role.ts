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

import * as c from '@aws-accelerator/common-config/src';
import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnIamRoleOutput } from './outputs';
import { Account } from '../../utils/accounts';

export interface CwlSubscriptionFilterRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
}

export async function createCwlSubscriptionFilterRoles(props: CwlSubscriptionFilterRoleProps): Promise<void> {
  const { accountStacks, config, accounts } = props;
  const centralLoggingServices = config['global-options']['central-log-services'];
  for (const account of accounts) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key, centralLoggingServices.region);
    if (!accountStack) {
      console.error(
        `Not able to create stack for "${centralLoggingServices.account}" while creating role for CWL Central logging`,
      );
      continue;
    }
    // Create IAM Role for reading logs from stream and push to destination
    const role = new iam.Role(accountStack, 'CWLSubscriptionFilterRole', {
      roleName: createRoleName('CWL-Subscription-Filter'),
      assumedBy: new iam.ServicePrincipal('logs.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    new CfnIamRoleOutput(accountStack, `CWLSubscriptionFilterRoleOutput`, {
      roleName: role.roleName,
      roleArn: role.roleArn,
      roleKey: 'CWLSubscriptionFilter',
    });
  }
}
