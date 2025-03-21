/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { CloudWatchClient, DescribeAlarmsCommand, MetricAlarm } from '@aws-sdk/client-cloudwatch';
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeMetricFiltersCommand,
  DescribeSubscriptionFiltersCommand,
  LogGroup,
  MetricFilter,
  SubscriptionFilter,
  LogGroupClass,
} from '@aws-sdk/client-cloudwatch-logs';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../../common/aws/backoff';
import { TableOperations } from '../common/dynamodb';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

async function describeMetricFilters(
  logGroupName: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: CloudWatchLogsClient;
  if (credentials) {
    serviceClient = new CloudWatchLogsClient({ credentials: credentials, region: region });
  } else {
    serviceClient = new CloudWatchLogsClient({ region: region });
  }
  const metricFilters: MetricFilter[] = [];
  let nextToken: string | undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeMetricFiltersCommand({ logGroupName: logGroupName, nextToken: nextToken })),
    );
    nextToken = results.nextToken;
    if (results.metricFilters) {
      metricFilters.push(...results.metricFilters);
    }
  } while (nextToken);

  const jsonResults = await stringify(metricFilters, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function describeAlarms(
  prefix: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: CloudWatchClient;
  if (credentials) {
    serviceClient = new CloudWatchClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new CloudWatchClient({ region: region });
  }

  const metricAlarms: MetricAlarm[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeAlarmsCommand({ AlarmNamePrefix: prefix, NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.MetricAlarms) {
      metricAlarms.push(...results.MetricAlarms);
    }
  } while (nextToken);

  const jsonResults = await stringify(metricAlarms, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

async function describeSubscriptionFilters(
  logGroupName: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: CloudWatchLogsClient;
  if (credentials) {
    serviceClient = new CloudWatchLogsClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new CloudWatchLogsClient({ region: region });
  }

  const subscriptionFilters: SubscriptionFilter[] = [];
  const results = await throttlingBackOff(() =>
    serviceClient.send(new DescribeSubscriptionFiltersCommand({ logGroupName: logGroupName })),
  );
  if (results.subscriptionFilters) {
    subscriptionFilters.push(...results.subscriptionFilters);
  }

  const jsonResults = await stringify(subscriptionFilters, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function snapshotCloudWatchLogResources(
  tableName: string,
  homeRegion: string,
  accountId: string,
  region: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  const snapshotTable = new TableOperations(tableName, homeRegion);
  let serviceClient: CloudWatchLogsClient;
  if (credentials) {
    serviceClient = new CloudWatchLogsClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new CloudWatchLogsClient({ region: region });
  }

  type LogGroupWithoutStoredBytes = Omit<LogGroup, 'storedBytes'>;
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeLogGroupsCommand({ nextToken: nextToken })),
    );
    nextToken = results.nextToken;
    if (results.logGroups) {
      for (const logGroup of results.logGroups) {
        // write log group
        const modifiedLogGroup: LogGroupWithoutStoredBytes = {
          arn: logGroup.arn,
          creationTime: logGroup.creationTime,
          dataProtectionStatus: logGroup.dataProtectionStatus,
          inheritedProperties: logGroup.inheritedProperties,
          kmsKeyId: logGroup.kmsKeyId,
          logGroupName: logGroup.logGroupName,
          metricFilterCount: logGroup.metricFilterCount,
          retentionInDays: logGroup.retentionInDays,
        };
        const logGroupJson = await stringify(modifiedLogGroup, { space: 1 });
        const logGroupHash = computeHash(logGroupJson);
        await snapshotTable.writeResource({
          accountId: accountId,
          region: region,
          resourceName: `cloudwatch-log-group-${logGroup.logGroupName}`,
          preMigration: preMigration,
          data: { jsonData: logGroupJson, hash: logGroupHash },
        });

        //get metric filters
        if (logGroup.metricFilterCount! > 0) {
          const metricFilterResults = await describeMetricFilters(logGroup.logGroupName!, region, credentials);
          await snapshotTable.writeResource({
            accountId: accountId,
            region: region,
            resourceName: `subscription-filters-${logGroup.logGroupName!}`,
            preMigration: preMigration,
            data: metricFilterResults,
          });
        }

        if (logGroup.logGroupClass && logGroup.logGroupClass !== LogGroupClass.INFREQUENT_ACCESS) {
        //get subscription filters
          const subscriptionFilterResults = await describeSubscriptionFilters(
            logGroup.logGroupName!,
            region,
            credentials,
          );
          await snapshotTable.writeResource({
            accountId: accountId,
            region: region,
            resourceName: `subscription-filters-${logGroup.logGroupName!}`,
            preMigration: preMigration,
            data: subscriptionFilterResults,
          });
        }
      }
    }
  } while (nextToken);
}
