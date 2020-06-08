import * as AWS from 'aws-sdk';
import { LogGroup } from 'aws-sdk/clients/cloudwatchlogs';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';
import { throttlingBackOff } from '@custom-resources/cfn-utils';

export interface HandlerProperties {
  logDestinationArn: string;
  globalExclusions?: string[];
}

export const handler = errorHandler(onEvent);

const logs = new AWS.CloudWatchLogs();

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Retriving Log Groups...`);
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
    try {
      await removeSubscriptionFilter(logGroup.logGroupName!);
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        // No Subscription filter for this logGroup
      } else {
        throw error;
      }
    }
  }
}

const isExcluded = (exclusions: string[], logGroupName: string): boolean => {
  for (const exclusion of exclusions || []) {
    if (logGroupName.startsWith(exclusion)) {
      return true;
    }
  }
  return false;
};

async function centralLoggingSubscription(event: CloudFormationCustomResourceEvent): Promise<string> {
  const physicalResourceId = 'PhysicalResourceId' in event ? event.PhysicalResourceId : undefined;
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  console.log(`Creating Log Subscription Filter for Central Logging...`);
  console.log(JSON.stringify(properties, null, 2));
  const { logDestinationArn } = properties;
  const globalExclusions = properties.globalExclusions?.map(ex => (ex.endsWith('*') ? ex.slice(0, -1) : ex));
  console.log(globalExclusions);
  const logGroups = await getLogGroups();
  const excludedLogGroups = logGroups.filter(lg => !isExcluded(globalExclusions || [], lg.logGroupName!));
  for (const logGroup of excludedLogGroups) {
    if (isExcluded(globalExclusions || [], logGroup.logGroupName!)) {
      // Ignore logGroup as it is specified in exclusion list
      continue;
    }
    // Delete Subscription filter from logGroup
    try {
      await removeSubscriptionFilter(logGroup.logGroupName!);
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        // No Subscription filter for this logGroup
      } else {
        throw error;
      }
    }
  }
  for (const logGroup of excludedLogGroups) {
    if (isExcluded(globalExclusions || [], logGroup.logGroupName!)) {
      // Ignore logGroup as it is specified in exclusion list
      continue;
    }
    // Add Subscription filter to logGroup
    console.log(`Adding subscription filter for ${logGroup.logGroupName}`);
    await addSubscriptionFilter(logGroup.logGroupName!, logDestinationArn);
  }
  return physicalResourceId!;
}

async function removeSubscriptionFilter(logGroupName: string) {
  // Remove existing subscription filter
  await throttlingBackOff(() =>
    logs
      .deleteSubscriptionFilter({
        logGroupName,
        filterName: `CentralLogging${logGroupName}`,
      })
      .promise(),
  );
}

async function addSubscriptionFilter(logGroupName: string, destinationArn: string) {
  // Adding subscription filter
  await throttlingBackOff(() =>
    logs
      .putSubscriptionFilter({
        destinationArn,
        logGroupName,
        filterName: `CentralLogging${logGroupName}`,
        filterPattern: '',
      })
      .promise(),
  );
}

async function getLogGroups(): Promise<LogGroup[]> {
  const logGroups: LogGroup[] = [];
  let token: string | undefined;
  do {
    if (token) {
      // Throttle requests
      await delay(1000);
    }
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

export async function delay(ms: number) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
}
