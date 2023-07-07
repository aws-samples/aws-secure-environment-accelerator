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
import { LogGroup, SubscriptionFilters } from 'aws-sdk/clients/cloudwatchlogs';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff, CloudWatchRulePrefix } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  logDestinationArn: string;
  globalExclusions?: string[];
  logRetention: number;
  subscriptionFilterRoleArn?: string;
}

export const handler = errorHandler(onEvent);

const logs = new AWS.CloudWatchLogs();

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Add Subscription to point LogDestination in log-archive account...`);
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

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  await centralLoggingSubscription(event);
  return {
    physicalResourceId: 'CWLCentralLoggingSubscriptionFilter',
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  await centralLoggingSubscriptionUpdate(event);
  return {
    physicalResourceId: 'CWLCentralLoggingSubscriptionFilter',
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  if (event.PhysicalResourceId !== 'CWLCentralLoggingSubscriptionFilter') {
    return;
  }
  // Remove Subscription that are added
  const logGroups = await getLogGroups();
  await Promise.all(
    logGroups.map(async logGroup => {
      // Delete Subscription filter from logGroup
      const filterName = `${CloudWatchRulePrefix}${logGroup.logGroupName}`;
      await removeSubscriptionFilter(logGroup.logGroupName!, filterName);
    }),
  );
}

const isExcluded = (exclusions: string[], logGroupName: string): boolean => {
  for (const exclusion of exclusions || []) {
    if (exclusion.endsWith('*') && logGroupName.startsWith(exclusion.slice(0, -1))) {
      return true;
    } else if (logGroupName === exclusion) {
      return true;
    }
  }
  return false;
};

async function centralLoggingSubscription(event: CloudFormationCustomResourceEvent): Promise<void> {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { logDestinationArn, logRetention, subscriptionFilterRoleArn } = properties;
  const globalExclusions = properties.globalExclusions || [];
  const logGroups = await getLogGroups();
  const filterLogGroups = logGroups.filter(lg => !isExcluded(globalExclusions, lg.logGroupName!));
  await Promise.all(
    filterLogGroups.map(async logGroup => {
      // Get Subscription filter and remove
      const filterName = `${CloudWatchRulePrefix}${logGroup.logGroupName}`;
      const subscriptinFilters = await getSubscriptionFilters(logGroup.logGroupName!);
      if (subscriptinFilters && subscriptinFilters.length > 0) {
        // Remove existing Subscription filters
        for (const subscriptinFilter of subscriptinFilters) {
          if (subscriptinFilter.filterName === filterName) {
            await removeSubscriptionFilter(logGroup.logGroupName!, subscriptinFilter.filterName);
          }
        }
      }
      // Change Log Retention for Log Group
      await putLogRetentionPolicy(logGroup.logGroupName!, logRetention);
      // Add Subscription filter to logGroup
      console.log(`Adding subscription filter for ${logGroup.logGroupName}`);
      await addSubscriptionFilter(logGroup.logGroupName!, logDestinationArn, subscriptionFilterRoleArn!);
    }),
  );
}

async function centralLoggingSubscriptionUpdate(event: CloudFormationCustomResourceEvent): Promise<void> {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { logDestinationArn, logRetention, subscriptionFilterRoleArn } = properties;
  const globalExclusions = properties.globalExclusions || [];
  const logGroups = await getLogGroups();
  const filterLogGroups = logGroups.filter(lg => !isExcluded(globalExclusions, lg.logGroupName!));

  await Promise.all(
    filterLogGroups.map(async logGroup => {
      // Get Subscription filter and remove
      const subscriptinFilters = await getSubscriptionFilters(logGroup.logGroupName!);
      const filterName = `${CloudWatchRulePrefix}${logGroup.logGroupName}`;
      if (subscriptinFilters && subscriptinFilters.length > 0) {
        for (const subscriptinFilter of subscriptinFilters) {
          if (subscriptinFilter.filterName === filterName) {
            await removeSubscriptionFilter(logGroup.logGroupName!, subscriptinFilter.filterName);
          }
        }
      }
      // Change Log Retention for Log Group
      await putLogRetentionPolicy(logGroup.logGroupName!, logRetention);
      // Add Subscription filter to logGroup
      console.log(`Adding subscription filter for ${logGroup.logGroupName}`);
      await addSubscriptionFilter(logGroup.logGroupName!, logDestinationArn, subscriptionFilterRoleArn!);
    }),
  );
}

async function removeSubscriptionFilter(logGroupName: string, filterName: string) {
  // Remove existing subscription filter
  try {
    await throttlingBackOff(() =>
      logs
        .deleteSubscriptionFilter({
          logGroupName,
          filterName,
        })
        .promise(),
    );
  } catch (error: any) {
    if (error.code === 'ResourceNotFoundException') {
      // No Subscription filter for this logGroup
    } else {
      console.warn(error.message);
    }
  }
}

async function addSubscriptionFilter(logGroupName: string, destinationArn: string, subscriptionFilterRoleArn: string) {
  try {
    // Adding subscription filter
    await throttlingBackOff(() =>
      logs
        .putSubscriptionFilter({
          destinationArn,
          logGroupName,
          filterName: `${CloudWatchRulePrefix}${logGroupName}`,
          filterPattern: '',
          roleArn: subscriptionFilterRoleArn,
        })
        .promise(),
    );
  } catch (error: any) {
    console.error(`Error while adding subscription filter to log group ${logGroupName}: ${error.message}`);
  }
}

async function getLogGroups(): Promise<LogGroup[]> {
  const logGroups: LogGroup[] = [];
  let token: string | undefined;
  do {
    const response = await throttlingBackOff(() =>
      logs
        .describeLogGroups({
          nextToken: token,
        })
        .promise(),
    );
    token = response.nextToken;
    logGroups.push(...response.logGroups!);
  } while (token);
  return logGroups;
}

async function getSubscriptionFilters(logGroupName: string): Promise<SubscriptionFilters | undefined> {
  // Get existing subscription filter for logGroup
  try {
    const subscriptionFilters = await throttlingBackOff(() =>
      logs
        .describeSubscriptionFilters({
          logGroupName,
        })
        .promise(),
    );
    return subscriptionFilters.subscriptionFilters;
  } catch (error: any) {
    console.log(`Error while retrieving subscription filters: ${error.message}`);
  }
}

async function putLogRetentionPolicy(logGroupName: string, retentionInDays: number) {
  try {
    await throttlingBackOff(() =>
      logs
        .putRetentionPolicy({
          logGroupName,
          retentionInDays,
        })
        .promise(),
    );
  } catch (error: any) {
    console.error(`Error while updating retention policy on "${logGroupName}": ${error.message}`);
  }
}
