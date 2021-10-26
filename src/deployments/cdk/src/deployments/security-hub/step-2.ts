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

import { Account } from '../../utils/accounts';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { SecurityHub } from '@aws-accelerator/cdk-constructs/src/security-hub';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export interface SecurityHubStep2Props {
  accounts: Account[];
  config: AcceleratorConfig;
  accountStacks: AccountStacks;
  outputs: StackOutput[];
}
/**
 *
 * @param props
 * Accept invites in sub accounts in all regions excluding security-hub-excl-regions
 */
export async function step2(props: SecurityHubStep2Props) {
  const { accounts, accountStacks, config, outputs } = props;
  const globalOptions = config['global-options'];
  if (!globalOptions['central-security-services']['security-hub']) {
    return;
  }
  const regions = globalOptions['supported-regions'];
  const securityAccountKey = config.getMandatoryAccountKey('central-security');
  const securityMasterAccount = accounts.find(a => a.key === securityAccountKey);

  for (const account of accounts) {
    if (account.id === securityMasterAccount?.id) {
      continue;
    }

    const securityHubRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: account.key,
      roleKey: 'SecurityHubRole',
    });
    if (!securityHubRoleOutput) {
      continue;
    }

    const securityHubExclRegions = globalOptions['central-security-services']['security-hub-excl-regions'] || [];
    for (const region of regions) {
      if (securityHubExclRegions.includes(region)) {
        console.info(
          `Security Hub is disabled in region "${region}" based on global-options/security-hub-excl-regions'`,
        );
        continue;
      }
      const memberAccountStack = accountStacks.tryGetOrCreateAccountStack(account.key, region);
      if (!memberAccountStack) {
        console.warn(`Cannot find account stack ${account.key} in region ${region}`);
        continue;
      }
      new SecurityHub(memberAccountStack, `SecurityHubMember-${account.key}`, {
        account,
        standards: globalOptions['security-hub-frameworks'],
        masterAccountId: securityMasterAccount?.id,
        roleArn: securityHubRoleOutput.roleArn,
      });
    }
  }
}
