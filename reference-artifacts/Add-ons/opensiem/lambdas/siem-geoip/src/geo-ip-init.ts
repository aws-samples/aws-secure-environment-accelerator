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

const AWS = require('aws-sdk');

AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';

import { errorHandler } from 'siem-common';

const lambdaClient = new AWS.Lambda();

export interface HandlerProperties {
  geoIpLambdaRoleArn: string;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`OpenSearch Siem GeoIp Init...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

function getPhysicalId(event: CloudFormationCustomResourceEvent): string {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  return `OpenSearchSiemGeoIpInit`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  const { geoIpLambdaRoleArn } = properties;

  try {
    const resp = await lambdaClient
      .invoke({
        FunctionName: geoIpLambdaRoleArn,
        InvocationType: 'Event',
      })
      .promise();

    console.log(resp);
  } catch (err) {
    console.log(err);
    // Don't fail lambda; it will retry later with the CloudWatch Event schedule.
  }

  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  if (event.PhysicalResourceId !== getPhysicalId(event)) {
    return;
  }

  return {
    physicalResourceId: getPhysicalId(event),
    data: {},
  };
}

const sleep = async (ms: number) => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};
