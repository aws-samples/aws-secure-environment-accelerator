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
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { EnableOptinRegionOutput } from './enable';
import { enableOptinRegion } from '..';

interface StepInput {
  enableOutput: OptinRegionList;
}

interface OptinRegionList {
  enabledOptinRegionList: EnableOptinRegionOutput[];
}

export const handler = async (input: StepInput): Promise<string> => {
  console.log(`Verifying status of enabled Optin Regions`);
  console.log(JSON.stringify(input, null, 2));

  const status: string[] = [];
  const sts = new STS();

  for (const enabledOptinRegion of input.enableOutput.enabledOptinRegionList) {
    const credentials = await sts.getCredentialsForAccountAndRole(
      enabledOptinRegion.accountId,
      enabledOptinRegion.assumeRoleName,
    );

    const account = new Account(credentials, 'us-east-1');

    const optInRegionStatus = await account.getRegionOptinStatus(enabledOptinRegion.optinRegionName);

    status.push(optInRegionStatus.RegionOptStatus!);
  }

  //"ENABLED"|"ENABLING"|"DISABLING"|"DISABLED"|"ENABLED_BY_DEFAULT"|string;

  const statusEnabling = status.filter(s => s === 'ENABLING');
  if (statusEnabling && statusEnabling.length > 0) {
    return 'IN_PROGRESS';
  }

  const statusDisabling = status.filter(s => s === 'DISABLING');
  if (statusDisabling && statusDisabling.length > 0) {
    return 'IN_PROGRESS';
  }

  return 'SUCCESS';
};
