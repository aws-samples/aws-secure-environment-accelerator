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

const OPERATION_IN_PROGRESS_STATUSES = ['QUEUED', 'RUNNING', 'STOPPING'];

interface VerifyStackSetInput {
  accountId?: string;
  stackName?: string;
  stackTemplateUrl?: string;
  stackTemplateBucket?: string;
  stackTemplateKey?: string;
}

export const handler = async (input: Partial<VerifyStackSetInput>) => {
  console.log(`Verifying stack...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName } = input;

  const cfn = new CloudFormation();
  const stackSet = await cfn.describeStackSet(stackName!);
  if (!stackSet) {
    return {
      status: 'FAILURE',
      statusReason: `Stack set with name "${stackName}" does not exists`,
    };
  }
  const operations = await cfn.listStackSetOperations(stackName!);
  const inProgress = operations.findIndex(o => OPERATION_IN_PROGRESS_STATUSES.includes(o.Status!)) >= 0;
  if (inProgress) {
    return {
      status: 'IN_PROGRESS',
      statusReason: '',
    };
  }

  const instances = await cfn.listStackInstances(stackName!);
  const nonCurrentInstances = instances.filter(i => i.Status !== 'CURRENT');
  if (nonCurrentInstances.length === 0) {
    return {
      status: 'SUCCESS',
      statusReason: '',
    };
  }

  const inOperableInstances = instances.filter(i => i.Status === 'INOPERABLE');
  if (inOperableInstances.length > 0) {
    return {
      status: 'IN_OPERABLE',
      statusReason: 'INOPERABLE instances to be cleared',
    };
  }

  return {
    status: 'FAILURE',
    statusReason: `There are ${nonCurrentInstances.length} non-current instances`,
    statusNonCurrentInstances: nonCurrentInstances,
  };
};
