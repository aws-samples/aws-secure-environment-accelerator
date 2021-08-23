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

import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  imageId: string;
  subnetId: string;
  instanceType?: string;
}

const ec2 = new AWS.EC2();
export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Amazon MarketPlace subscription check...`);
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
}

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const instanceParams = {
    ImageId: properties.imageId,
    SubnetId: properties.subnetId,
    InstanceType: properties.instanceType || 't2.micro',
    MinCount: 1,
    MaxCount: 1,
  };
  let status = 'Subscribed';
  try {
    await throttlingBackOff(() => ec2.runInstances(instanceParams).promise());
    console.log('Create Firewall Instance Success');
  } catch (error) {
    if (error.code === 'OptInRequired') {
      status = error.code;
    }
  }
  return {
    physicalResourceId: `SubscriptionCheck-${properties.imageId}`,
    data: {
      Status: status,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
