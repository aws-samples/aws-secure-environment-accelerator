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
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  serviceId: string;
  endpoints: string[];
}

const ec2 = new AWS.EC2();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Ec2AcceptVpcEndpointConnection for Ec2 Endpoint Service..`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return;
  }
}

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { serviceId, endpoints } = properties;
  await throttlingBackOff(() =>
    ec2
      .acceptVpcEndpointConnections({
        ServiceId: serviceId,
        VpcEndpointIds: endpoints,
      })
      .promise(),
  );
  return {
    physicalResourceId: `Ec2AcceptVpcEndpointConnection-${serviceId}`,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { endpoints, serviceId } = properties;

  const oldProperties = (event.OldResourceProperties as unknown) as HandlerProperties;
  const newEndpoints = endpoints.filter(ep => !oldProperties.endpoints.includes(ep));
  await throttlingBackOff(() =>
    ec2
      .acceptVpcEndpointConnections({
        ServiceId: serviceId,
        VpcEndpointIds: newEndpoints,
      })
      .promise(),
  );
  return {
    physicalResourceId: `Ec2AcceptVpcEndpointConnection-${serviceId}`,
  };
}
