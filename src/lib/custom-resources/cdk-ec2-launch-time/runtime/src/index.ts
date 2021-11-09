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

import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const ec2 = new AWS.EC2();

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
  console.log(`Finding launch time...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
};

async function onCreate(event: CloudFormationCustomResourceEvent) {
  // Find instances that match the given instance id
  const describeInstances = await throttlingBackOff(() =>
    ec2
      .describeInstances(
        buildRequest({
          instanceId: event.ResourceProperties.InstanceId,
        }),
      )
      .promise(),
  );

  const reservations = describeInstances.Reservations;
  const instance = reservations?.[0].Instances?.[0];
  if (!instance) {
    throw new Error(`Unable to find instance`);
  }

  return {
    Data: {
      LaunchTime: instance.LaunchTime,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

/**
 * Auxiliary method to build a DescribeInstancesRequest from the given parameters.
 */
function buildRequest(props: { instanceId: string }): AWS.EC2.DescribeInstancesRequest {
  const { instanceId } = props;

  const instanceIds = [];
  if (instanceId) {
    instanceIds.push(instanceId);
  }

  return {
    InstanceIds: instanceIds,
  };
}
