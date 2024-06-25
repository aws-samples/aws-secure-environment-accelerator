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

import { Account } from '@aws-accelerator/common/src/aws/account';
import { EC2 } from '@aws-accelerator/common/src/aws/ec2';
import { LoadConfigurationInput } from '../load-configuration-step';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';

interface EnableOptinRegionInput extends LoadConfigurationInput {
  accountId: string;
  assumeRoleName: string;
}

export interface EnableOptinRegionOutput {
  accountId: string;
  optinRegionName: string;
  assumeRoleName: string;
}

const CustomErrorMessage = [
  {
    code: 'AuthFailure',
    message: 'Region Not Enabled',
  },
  {
    code: 'OptInRequired',
    message: 'Region not Opted-in',
  },
];

const sts = new STS();
const organizations = new Organizations();
export const handler = async (input: EnableOptinRegionInput) => {
  console.log(`Enabling Opt-in Region in account ...`);
  console.log(JSON.stringify(input, null, 2));
  const { accountId, assumeRoleName, configRepositoryName, configFilePath, configCommitId } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const awsAccount = await organizations.getAccount(accountId);
  if (!awsAccount) {
    // This will never happen unless it is called explicitly with invalid AccountId
    throw new Error(`Unable to retrieve account info from Organizations API for "${accountId}"`);
  }

  const supportedRegions = acceleratorConfig['global-options']['supported-regions'];

  console.log(`${accountId}: ${JSON.stringify(supportedRegions, null, 2)}`);
  const errors: string[] = [];
  const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
  const account = new Account(credentials, 'us-east-1');
  const ec2 = new EC2(credentials, 'us-east-1');
  const isControlTower = acceleratorConfig['global-options']['ct-baseline'];
  const enabledRegions = await ec2.describeAllRegions();
  const enabledOptinRegionList: EnableOptinRegionOutput[] = [];

  if (!isControlTower) {
    if (enabledRegions) {
      const enabledRegionLookup = Object.fromEntries(enabledRegions.map(obj => [obj.RegionName, obj.OptInStatus]));

      for (const region of supportedRegions) {
        const enabledRegionStatus = enabledRegionLookup[region];

        // If region is an opt-in region
        if (enabledRegionStatus === 'not-opted-in') {
          // Check to see if it is Enabling state. This could happen during a SM restart.
          const optInRegionStatus = await account.getRegionOptinStatus(region);
          if (optInRegionStatus.RegionOptStatus! === 'ENABLING') {
            console.log(`Opt-in region '${region}' is already being enabled. Skipping.`);
            enabledOptinRegionList.push({
              accountId,
              optinRegionName: region,
              assumeRoleName,
            });
            continue;
          }

          console.log(`Enabling Opt-in region '${region}'`);
          try {
            await account.enableOptinRegion(region);
            enabledOptinRegionList.push({
              accountId,
              optinRegionName: region,
              assumeRoleName,
            });
          } catch (error: any) {
            errors.push(
              `${accountId}:${region}: ${error.code}: ${
                CustomErrorMessage.find(cm => cm.code === error.code)?.message || error.message
              }`,
            );
            continue;
          }
        } else if (enabledRegionStatus === 'opted-in') {
          console.log(`${region} already opted-in`);
        } else {
          // opt-in-not-required
          console.log(`${region} opt-in-not required`);
        }
      }
    }
  } else {
    console.log(`Control Tower is enabled. Skipping Opt-in enablement.`);
  }

  return { enabledOptinRegionList, outputCount: enabledOptinRegionList.length, errors, errorCount: errors.length };
};
