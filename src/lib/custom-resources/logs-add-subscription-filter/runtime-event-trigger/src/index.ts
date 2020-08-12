import * as AWS from 'aws-sdk';
import { throttlingBackOff, CloudWatchRulePrefix } from '@aws-accelerator/custom-resource-cfn-utils';

const logs = new AWS.CloudWatchLogs();

export const handler = async (input: any): Promise<string> => {
  console.log(`Add Subscription to point LogDestination in log-archive account...`);
  console.log(JSON.stringify(input, null, 2));

  const logGroupName = input['detail']['requestParameters']['logGroupName'];
  const logDestinationArn = process.env.LOG_DESTINATION;
  if (!logDestinationArn) {
    console.warn(`Log Destination is not praent in env for this account`);
    return `Log Destination is not praent in env for this account`;
  }
  let exclusions: string[] = [];
  if (process.env.EXCLUSIONS) {
    try {
      exclusions = JSON.parse(process.env.EXCLUSIONS);
    } catch (error) {
      console.warn(error.message);
    }
  }
  if (isExcluded(exclusions, logGroupName)) {
    return `No Need of Subscription Filter for "${logGroupName}"`;
  }
  await addSubscriptionFilter(logGroupName, logDestinationArn);
  const logRetention = process.env.LOG_RETENTION;
  if (logRetention) {
    // Update Log Retention Policy
    await putLogRetentionPolicy(logGroupName!, Number(logRetention));
  }
  return 'SUCCESS';
};

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
