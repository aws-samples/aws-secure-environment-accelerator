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

import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { Account } from '../../utils/accounts';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { SsmIncreaseThroughput } from '@aws-accelerator/custom-resource-ssm-increase-throughput';

export interface SSMStep2Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
}

/**
 * Increasing SSM Parameter store throughput
 * @param props
 */
export async function step2(props: SSMStep2Props) {
  const { accountStacks, accounts, config, outputs } = props;
  const regions = config['global-options']['supported-regions'];
  for (const account of accounts) {
    const ssmUpdateRole = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: account.key,
      roleKey: 'SSMUpdateRole',
    });
    if (!ssmUpdateRole) {
      console.warn(`No role created for  "${account.key}"`);
      continue;
    }
    for (const region of regions) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key, region);
      if (!accountStack) {
        console.warn(`Unable to create Account Stak for Account "${account.key}" and Region "${region}"`);
        continue;
      }
      new SsmIncreaseThroughput(accountStack, 'UpdateSSMParameterStoreThroughput', {
        roleArn: ssmUpdateRole.roleArn,
      });
    }
  }
}
