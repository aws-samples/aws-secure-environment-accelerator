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
import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { ResourceCleanup } from '@aws-accelerator/custom-resource-cleanup';
import { ResourceStackCleanupOutputFinder } from './outputs';
import { Context } from '../../utils/context';
import * as sv from 'semver';

export interface CdkStackCleanupProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  context: Context;
}

/**
 *
 *  Deletes Route53 private hosted zones and resolver rules and its associations
 *
 */
export async function step3(props: CdkStackCleanupProps) {
  const { accountStacks, config, outputs, context } = props;

  const installerVersion = context.installerVersion;
  // TODO verify the version and update it accordingly
  const isCleanupRequired = sv.clean(installerVersion) === null ? true : sv.lt(installerVersion, '1.3.0');
  if (!isCleanupRequired) {
    return;
  }

  // Finding the output for previous resource cleanup execution
  const resourceCleanupOutput = ResourceStackCleanupOutputFinder.tryFindOneByName({
    outputs,
    cdkStackCleanup: true,
  });

  // Checking if cleanup got executed in any of the previous SM runs
  if (resourceCleanupOutput) {
    console.warn(`Skipping Execution, CdkToolKit stack cleanup has been executed earlier`);
    return;
  }

  const regions = config['global-options']['supported-regions'];

  for (const [accountKey, _] of config.getAccountConfigs()) {
    const cleanupRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'ResourceCleanupRole',
    });
    if (!cleanupRoleOutput) {
      console.warn(`Cannot find Cleanup custom resource Roles output for account ${accountKey}`);
      continue;
    }

    for (const region of regions) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }

      new ResourceCleanup(accountStack, `CdkStackCleanup${accountKey}-${region}`, {
        roleArn: cleanupRoleOutput.roleArn,
        cdkStackName: 'CDKToolkit',
      });
    }
  }
}
