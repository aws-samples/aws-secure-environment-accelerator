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

import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import { GatherInventory } from '@aws-accelerator/cdk-constructs/src/ssm';
export interface InventoryCollectionProps {
  acceleratorPrefix: string;
  logBucketName: string;
  acceleratorConfig: c.AcceleratorConfig;
  accountStacks: AccountStacks;
}

export async function inventoryCollection(props: InventoryCollectionProps) {
  const { acceleratorPrefix, acceleratorConfig, logBucketName, accountStacks } = props;

  const ssmInventoryToAccounts: { accountKey: string }[] = [];

  const accountConfigs = acceleratorConfig.getAccountConfigs();

  // Below code will find ssm inventory collection to specific accounts
  for (const [accountKey, mandatoryConfig] of Object.values(accountConfigs)) {
    const ssmInventoryEnabledAccount = mandatoryConfig['ssm-inventory-collection'];
    if (!ssmInventoryEnabledAccount) {
      continue;
    }
    ssmInventoryToAccounts.push({ accountKey });
  }

  // Below code will find ssm inventory collection to OUs
  const oUs = acceleratorConfig.getOrganizationalUnits();
  for (const [ouKey, ou] of Object.values(oUs)) {
    console.log('ouKey', ouKey);
    const ssmInventoryEnabledOu = ou['ssm-inventory-collection'];
    if (!ssmInventoryEnabledOu) {
      continue;
    }
    const ouAccountConfigs = acceleratorConfig.getAccountConfigsForOu(ouKey);
    for (const [accountKey] of Object.values(ouAccountConfigs)) {
      ssmInventoryToAccounts.push({ accountKey });
    }
  }

  console.log('ssmInventoryToAccounts', ssmInventoryToAccounts);

  const regions = acceleratorConfig['global-options']['supported-regions'];
  const logBucketRegion = acceleratorConfig['global-options']['central-log-services'].region;

  // enabling SSM Inventory on account settings
  for (const ssmInventoryToAccount of Object.values(ssmInventoryToAccounts)) {
    const accountKey = ssmInventoryToAccount.accountKey;

    for (const region of regions) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }

      new GatherInventory(accountStack, 'GatherInventory', {
        bucketName: logBucketName,
        bucketRegion: logBucketRegion,
        accountId: accountStack.accountId,
        prefix: acceleratorPrefix,
      });
    }
  }
}
