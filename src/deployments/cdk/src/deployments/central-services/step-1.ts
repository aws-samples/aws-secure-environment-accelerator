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

import * as cdk from '@aws-cdk/core';
import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '../../utils/accounts';
import * as iam from '@aws-cdk/aws-iam';

export interface CentralServicesStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
  rootOuId: string;
}

/**
 * Enable Central Services Step 1
 * - Enable Sharing Organization accounts list to monitoring accounts in master account.
 */
export async function step1(props: CentralServicesStep1Props) {
  const { accountStacks, config, accounts, rootOuId } = props;

  const globalOptions = config['global-options'];

  if (globalOptions) {
    await centralServicesSettingsInMaster({
      accountStacks,
      config: globalOptions,
      accounts,
      rootOuId,
    });
  }
}

/**
 * Central Services Settings in Master Account
 */
async function centralServicesSettingsInMaster(props: {
  accountStacks: AccountStacks;
  config: c.GlobalOptionsConfig;
  accounts: Account[];
  rootOuId: string;
}) {
  const { accountStacks, config, accounts, rootOuId } = props;

  const accountIds: string[] = [];
  if (config['central-security-services'] && config['central-security-services'].cwl) {
    accountIds.push(getAccountId(accounts, config['central-security-services'].account)!);
  }
  if (config['central-operations-services'] && config['central-operations-services'].cwl) {
    accountIds.push(getAccountId(accounts, config['central-operations-services'].account)!);
  }
  if (config['central-log-services'] && config['central-log-services'].cwl) {
    accountIds.push(getAccountId(accounts, config['central-log-services'].account)!);
  }

  if (accountIds.length === 0) {
    return;
  }

  // Enable Cross-Account CloudWatch access in Master account fot sub accounts
  const masterStack = accountStacks.getOrCreateAccountStack(config['aws-org-management'].account);
  await cloudWatchSettingsInMaster({
    scope: masterStack,
    accountIds,
    rootOuId,
  });
}

/**
 * Cloud Watch Cross Account Settings in Master Account
 * 5.15b - READY - Centralize CWL - Part 1
 */
async function cloudWatchSettingsInMaster(props: { scope: cdk.Construct; accountIds: string[]; rootOuId: string }) {
  const { scope, accountIds, rootOuId } = props;
  const accountPrincipals: iam.PrincipalBase[] = accountIds.map(accountId => {
    return new iam.AccountPrincipal(accountId);
  });
  const cwlCrossAccountSharingRole = new iam.Role(scope, 'CloudWatch-CrossAccountSharing', {
    roleName: 'CloudWatch-CrossAccountSharing-ListAccountsRole',
    assumedBy: new iam.PrincipalWithConditions(new iam.CompositePrincipal(...accountPrincipals), {
      StringEquals: {
        'aws:PrincipalOrgID': rootOuId,
      },
    }),
  });
  cwlCrossAccountSharingRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      resources: ['*'],
      actions: ['organizations:ListAccounts', 'organizations:ListAccountsForParent'],
    }),
  );
}
