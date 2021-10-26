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
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  logGroupName: string;
  filterPattern: string;
  metricName: string;
  metricNamespace: string;
  defaultValue: number;
  metricValue: string;
  filterName: string;
}

const logs = new AWS.CloudWatchLogs();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Creating Log Group Metric filter...`);
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

async function onCreateOrUpdate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const {
    defaultValue,
    logGroupName,
    filterPattern,
    metricName,
    filterName,
    metricNamespace,
    metricValue,
  } = properties;

  const logGroup = await throttlingBackOff(() =>
    logs
      .describeLogGroups({
        logGroupNamePrefix: logGroupName,
      })
      .promise(),
  );
  if (logGroup.logGroups?.length !== 0) {
    await throttlingBackOff(() =>
      logs
        .putMetricFilter({
          filterName,
          filterPattern,
          logGroupName,
          metricTransformations: [
            {
              metricName,
              metricNamespace,
              metricValue,
              defaultValue,
            },
          ],
        })
        .promise(),
    );
  } else {
    throw new Error(`Did not find LogGroup "${logGroupName}"`);
  }

  return {
    physicalResourceId: metricName,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting Log Group Metric filter...`);
  console.log(JSON.stringify(event, null, 2));
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  if (event.PhysicalResourceId === properties.metricName) {
    const { filterName, logGroupName } = properties;
    try {
      await throttlingBackOff(() =>
        logs
          .deleteMetricFilter({
            filterName,
            logGroupName,
          })
          .promise(),
      );
    } catch (error) {
      console.error(`Ignoring error since it is Delete action`);
      console.error(error);
    }
  }
}
