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

import { CloudFormation } from '@aws-accelerator/common/src/aws/cloudformation';

const cfn = new CloudFormation();

interface DeleteStackSetInstancesInput {
  stackName: string;
  instanceAccounts: string[];
  instanceRegions: string[];
  retainStacks?: boolean;
}

export const handler = async (input: DeleteStackSetInstancesInput) => {
  console.log(`Deleting stack set instances...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, instanceAccounts, instanceRegions, retainStacks } = input;

  const existingInstances = await cfn.listStackInstances(stackName);
  const existingInstanceAccountIds = existingInstances.map(i => i.Account!);

  // Check if there are existing instance account IDs that should not exist
  const instanceAccountsToBeDeleted = existingInstanceAccountIds.filter(id => !instanceAccounts.includes(id));
  if (instanceAccountsToBeDeleted.length === 0) {
    return {
      status: 'UP_TO_DATE',
    };
  }

  console.log(`Deleting stack instances for accounts ${instanceAccountsToBeDeleted.join(', ')}`);

  await cfn.deleteStackInstances({
    StackSetName: stackName,
    Accounts: instanceAccountsToBeDeleted,
    Regions: instanceRegions,
    RetainStacks: !!retainStacks,
  });

  return {
    status: 'SUCCESS',
  };
};
