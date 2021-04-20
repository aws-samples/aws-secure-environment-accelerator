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
    try {
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
    } catch (error) {
      console.error(`Did not find LogGroup ${logGroupName}`);
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
