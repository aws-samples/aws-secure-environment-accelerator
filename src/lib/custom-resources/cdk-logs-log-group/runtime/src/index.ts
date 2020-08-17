import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export type Tags = AWS.CloudWatchLogs.Tags;

export interface HandlerProperties {
  logGroupName: string;
  retention?: number;
  tags?: Tags;
  kmsKeyId?: string;
}

export const handler = errorHandler(onEvent);

const logs = new AWS.CloudWatchLogs();

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Creating log group...`);
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

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { logGroupName, retention, tags, kmsKeyId } = properties;
  try {
    const existingLogGroup = await throttlingBackOff(() =>
      logs
        .describeLogGroups({
          logGroupNamePrefix: logGroupName,
        })
        .promise(),
    );
    if (existingLogGroup.logGroups && existingLogGroup.logGroups.length > 0) {
      console.warn(`Log Group is already exists : ${logGroupName}`);
      if (kmsKeyId) {
        // Add kmsKeyId to logGroup
        await throttlingBackOff(() =>
          logs
            .associateKmsKey({
              kmsKeyId,
              logGroupName,
            })
            .promise(),
        );
      }
    } else {
      await throttlingBackOff(() =>
        logs
          .createLogGroup({
            logGroupName: logGroupName,
            tags,
            kmsKeyId,
          })
          .promise(),
      );
    }
  } catch (e) {
    throw new Error(`Cannot create log group: ${JSON.stringify(e)}`);
  }
  try {
    if (!retention) {
      await throttlingBackOff(() =>
        logs
          .deleteRetentionPolicy({
            logGroupName: logGroupName,
          })
          .promise(),
      );
    } else {
      await throttlingBackOff(() =>
        logs
          .putRetentionPolicy({
            logGroupName: logGroupName,
            retentionInDays: retention,
          })
          .promise(),
      );
    }
  } catch (e) {
    throw new Error(`Cannot put log group retention: ${JSON.stringify(e)}`);
  }
  return {
    physicalResourceId: logGroupName,
    data: {
      LogGroupName: logGroupName,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
