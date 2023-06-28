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

import {
  CostAndUsageReportServiceClient,
  DescribeReportDefinitionsCommand,
  ReportDefinition,
} from '@aws-sdk/client-cost-and-usage-report-service';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { SnapshotData } from '../common/types';
import { computeHash } from '../common/hash';
import { throttlingBackOff } from '../../common/aws/backoff';

const stringify = require('fast-json-stable-stringify');

export async function describeCostUsageReporting(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: CostAndUsageReportServiceClient;
  if (credentials) {
    serviceClient = new CostAndUsageReportServiceClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new CostAndUsageReportServiceClient({ region: region });
  }

  const reportDefinitions: ReportDefinition[] = [];
  let nextToken: string | undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeReportDefinitionsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.ReportDefinitions) {
      reportDefinitions.push(...results.ReportDefinitions);
    }
  } while (nextToken);

  const jsonResults = await stringify(reportDefinitions, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
