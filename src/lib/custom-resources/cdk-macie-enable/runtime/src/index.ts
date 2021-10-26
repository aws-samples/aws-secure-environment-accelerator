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
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export enum MacieFrequency {
  FIFTEEN_MINUTES = 'FIFTEEN_MINUTES',
  ONE_HOUR = 'ONE_HOUR',
  SIX_HOURS = 'SIX_HOURS',
}

export enum MacieStatus {
  ENABLED = 'ENABLED',
  PAUSED = 'PAUSED',
}

const macie = new AWS.Macie2();

export interface HandlerProperties {
  findingPublishingFrequency: MacieFrequency;
  status: MacieStatus;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Enable Macie admin...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return;
  }
}

function getPhysicalId(event: CloudFormationCustomResourceEvent): string {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  return `${properties.findingPublishingFrequency}${properties.status}`;
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const response = await enableMacie(properties);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function enableMacie(properties: HandlerProperties) {
  try {
    const enableAdmin = await throttlingBackOff(() =>
      macie
        .enableMacie({
          findingPublishingFrequency: properties.findingPublishingFrequency,
          status: properties.status,
        })
        .promise(),
    );

    return enableAdmin;
  } catch (e) {
    const message = `${e}`;
    if (message.includes('Macie has already been enabled')) {
      console.warn(e);
    } else {
      throw e;
    }
  }
}
