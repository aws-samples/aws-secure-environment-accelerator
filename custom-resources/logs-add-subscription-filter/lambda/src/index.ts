import * as AWS from 'aws-sdk';
import { LogGroup } from 'aws-sdk/clients/cloudwatchlogs';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';
import { throttlingBackOff, CloudWatchRulePrefix } from '@custom-resources/cfn-utils';

export interface HandlerProperties {
  logDestinationArn: string;
  globalExclusions?: string[];
}

export const handler = errorHandler(onEvent);

const logs = new AWS.CloudWatchLogs();

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Add Subscription to point LogDestination in log-archive account...`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
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
  const response = await centralLoggingSubscription(event);
  return {
    physicalResourceId: response,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  // Remove Subscription that are added
  const logGroups = await getLogGroups();
  for (const logGroup of logGroups) {
    // Delete Subscription filter from logGroup
    await removeSubscriptionFilter(logGroup.logGroupName!);
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
  const { logDestinationArn } = properties;
  const globalExclusions = properties.globalExclusions || [];
  const logGroups = await getLogGroups();
  const filterLogGroups = logGroups.filter(lg => !isExcluded(globalExclusions, lg.logGroupName!));
  for (const logGroup of filterLogGroups) {
    // Add Subscription filter to logGroup
    console.log(`Adding subscription filter for ${logGroup.logGroupName}`);
    await addSubscriptionFilter(logGroup.logGroupName!, logDestinationArn);
  }
  return physicalResourceId!;
}

async function removeSubscriptionFilter(logGroupName: string) {
  // Remove existing subscription filter
  try {
    await throttlingBackOff(() =>
      logs
        .deleteSubscriptionFilter({
          logGroupName,
          filterName: `${CloudWatchRulePrefix}${logGroupName}`,
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
