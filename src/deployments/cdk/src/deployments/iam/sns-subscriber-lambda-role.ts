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
import { AccountStack, AccountStacks } from '../../common/account-stacks';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnIamRoleOutput } from './outputs';
import { Account } from '../../utils/accounts';

export interface CreateSnsSubscriberLambdaRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
}

export async function createSnsSubscriberLambdaRole(props: CreateSnsSubscriberLambdaRoleProps): Promise<void> {
  const { accountStacks, config } = props;
  const centralLoggingServices = config['global-options']['central-log-services'];
  const centralManagementServices = config['global-options']['aws-org-management'];
  const centralSecurityServices = config['global-options']['central-security-services'];
  const centralLogAccountStack = accountStacks.tryGetOrCreateAccountStack(
    centralLoggingServices.account,
    centralLoggingServices.region,
  );
  if (!centralLogAccountStack) {
    console.error(
      `Not able to create stack for "${centralLoggingServices.account}" while creating role for SNS Topic Subscribers`,
    );
    return;
  }
  createRole(centralLogAccountStack);
  if (centralManagementServices['add-sns-topics']) {
    const managementAccountStack = accountStacks.tryGetOrCreateAccountStack(
      centralManagementServices.account,
      centralManagementServices.region,
    );
    if (!managementAccountStack) {
      console.error(
        `Not able to create stack for "${managementAccountStack}" while creating role for SNS Topic Subscribers`,
      );
      return;
    }
    createRole(managementAccountStack);
  }

  if (centralSecurityServices['add-sns-topics']) {
    const securityAccountStack = accountStacks.tryGetOrCreateAccountStack(
      centralSecurityServices.account,
      centralSecurityServices.region,
    );
    if (!securityAccountStack) {
      console.error(
        `Not able to create stack for "${centralSecurityServices.account}" while creating role for SNS Topic Subscribers`,
      );
      return;
    }
    createRole(securityAccountStack);
  }
}

function createRole(accountStack: AccountStack) {
  // Create IAM Role for reading logs from stream and push to destination
  const role = new iam.Role(accountStack, 'SnsSubscriberLambdaRole', {
    roleName: createRoleName('SnsSubscriberLambda'),
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['sns:Publish', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey'],
      resources: ['*'],
    }),
  );

  new CfnIamRoleOutput(accountStack, `SnsSubscriberLambdaOutput`, {
    roleName: role.roleName,
    roleArn: role.roleArn,
    roleKey: 'SnsSubscriberLambda',
  });
}
