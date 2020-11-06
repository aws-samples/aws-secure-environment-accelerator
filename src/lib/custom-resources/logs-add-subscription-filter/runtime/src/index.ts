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
  const response = await centralLoggingSubscription(event);
  return {
    physicalResourceId: response,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const response = await centralLoggingSubscriptionUpdate(event);
  return {
    physicalResourceId: response,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  // Remove Subscription that are added
  const logGroups = await getLogGroups();
  for (const logGroup of logGroups) {
    // Delete Subscription filter from logGroup
    const filterName = `${CloudWatchRulePrefix}${logGroup.logGroupName}`;
    await removeSubscriptionFilter(logGroup.logGroupName!, filterName);
  }
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

async function centralLoggingSubscription(event: CloudFormationCustomResourceEvent): Promise<string> {
  const physicalResourceId = 'PhysicalResourceId' in event ? event.PhysicalResourceId : undefined;
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { logDestinationArn, logRetention } = properties;
  const globalExclusions = properties.globalExclusions || [];
  const logGroups = await getLogGroups();
  const filterLogGroups = logGroups.filter(lg => !isExcluded(globalExclusions, lg.logGroupName!));
  for (const logGroup of filterLogGroups) {
    // Get Subscription filter and remove
    const subscriptinFilters = await getSubscriptionFilters(logGroup.logGroupName!);
    if (subscriptinFilters && subscriptinFilters.length > 0) {
      // Remove existing Subscription filters
      for (const subscriptinFilter of subscriptinFilters) {
        await removeSubscriptionFilter(logGroup.logGroupName!, subscriptinFilter.filterName!);
      }
    }
    // Change Log Retention for Log Group
    await putLogRetentionPolicy(logGroup.logGroupName!, logRetention);
    // Add Subscription filter to logGroup
    console.log(`Adding subscription filter for ${logGroup.logGroupName}`);
    await addSubscriptionFilter(logGroup.logGroupName!, logDestinationArn);
  }
  return physicalResourceId!;
}

async function centralLoggingSubscriptionUpdate(event: CloudFormationCustomResourceEvent): Promise<string> {
  const physicalResourceId = 'PhysicalResourceId' in event ? event.PhysicalResourceId : undefined;
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { logDestinationArn, logRetention } = properties;
  const globalExclusions = properties.globalExclusions || [];
  const logGroups = await getLogGroups();
  const filterLogGroups = logGroups.filter(lg => !isExcluded(globalExclusions, lg.logGroupName!));
  for (const logGroup of logGroups) {
    // Remove "PBMM-" Subscription filter from all log Groups if exists on update
    const filterName = `${CloudWatchRulePrefix}${logGroup.logGroupName}`;
    await removeSubscriptionFilter(logGroup.logGroupName!, filterName);
  }
  for (const logGroup of filterLogGroups) {
    // Get Subscription filter and remove
    const subscriptinFilters = await getSubscriptionFilters(logGroup.logGroupName!);
    if (subscriptinFilters && subscriptinFilters.length > 0) {
      // Remove existing Subscription filters
      for (const subscriptinFilter of subscriptinFilters) {
        await removeSubscriptionFilter(logGroup.logGroupName!, subscriptinFilter.filterName!);
      }
    }
    // Change Log Retention for Log Group
    await putLogRetentionPolicy(logGroup.logGroupName!, logRetention);
    // Add Subscription filter to logGroup
    console.log(`Adding subscription filter for ${logGroup.logGroupName}`);
    await addSubscriptionFilter(logGroup.logGroupName!, logDestinationArn);
  }
  return physicalResourceId!;
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
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      // No Subscription filter for this logGroup
    } else {
      console.warn(error.message);
    }
  }
}

async function addSubscriptionFilter(logGroupName: string, destinationArn: string) {
  try {
    // Adding subscription filter
    await throttlingBackOff(() =>
      logs
        .putSubscriptionFilter({
          destinationArn,
          logGroupName,
          filterName: `${CloudWatchRulePrefix}${logGroupName}`,
          filterPattern: '',
        })
        .promise(),
    );
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    console.error(`Error while updating retention policy on "${logGroupName}": ${error.message}`);
  }
}
