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
  AdvancedEventSelector,
  CloudTrailClient,
  DescribeTrailsCommand,
  EventSelector,
  GetEventSelectorsCommand,
  GetInsightSelectorsCommand,
  InsightNotEnabledException,
  InsightSelector,
  ListTrailsCommand,
  TrailNotFoundException,
} from '@aws-sdk/client-cloudtrail';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { SnapshotData } from '../common/types';
import { computeHash } from '../common/hash';
import { throttlingBackOff } from '../../common/aws/backoff';

const stringify = require('fast-json-stable-stringify');

export async function describeCloudTrail(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: CloudTrailClient;
  if (credentials) {
    serviceClient = new CloudTrailClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new CloudTrailClient({ region: region });
  }

  const results = await throttlingBackOff(() => serviceClient.send(new DescribeTrailsCommand({})));
  const jsonResults = await stringify(results.trailList ?? {}, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getCloudTrailInsightSelectors(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: CloudTrailClient;
  type Selectors = {
    TrailArn: string;
    InsightSelectors: InsightSelector[];
  };
  if (credentials) {
    serviceClient = new CloudTrailClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new CloudTrailClient({ region: region });
  }

  let selectors: Selectors | undefined = undefined;
  const listTrailResults = await throttlingBackOff(() => serviceClient.send(new ListTrailsCommand({})));

  let insightClient: CloudTrailClient;
  for (const trail of listTrailResults.Trails!) {
    if (credentials) {
      insightClient = new CloudTrailClient({ region: trail.HomeRegion, credentials: credentials });
    } else {
      insightClient = new CloudTrailClient({ region: trail.HomeRegion });
    }
    try {
      const insightSelectorResults = await throttlingBackOff(() =>
        insightClient.send(new GetInsightSelectorsCommand({ TrailName: trail.Name })),
      );
      selectors = {
        TrailArn: insightSelectorResults.TrailARN ?? '',
        InsightSelectors: insightSelectorResults.InsightSelectors ?? [],
      };
    } catch (e) {
      if (e instanceof InsightNotEnabledException) {
        selectors = { TrailArn: '', InsightSelectors: [] };
      }
    }
  }

  const jsonResults = await stringify(selectors ?? {}, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getCloudTrailEventSelectors(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: CloudTrailClient;
  type Selectors = {
    TrailArn: string;
    EventSelectors: EventSelector[];
    AdvancedEventSelectors: AdvancedEventSelector[];
  };
  if (credentials) {
    serviceClient = new CloudTrailClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new CloudTrailClient({ region: region });
  }

  let selectors: Selectors | undefined = undefined;
  const listTrailResults = await throttlingBackOff(() => serviceClient.send(new ListTrailsCommand({})));

  let eventClient: CloudTrailClient;
  for (const trail of listTrailResults.Trails!) {
    if (credentials) {
      eventClient = new CloudTrailClient({ region: trail.HomeRegion, credentials: credentials });
    } else {
      eventClient = new CloudTrailClient({ region: trail.HomeRegion });
    }
    try {
      const eventSelectorResults = await throttlingBackOff(() =>
        eventClient.send(new GetEventSelectorsCommand({ TrailName: trail.Name })),
      );
      selectors = {
        TrailArn: eventSelectorResults.TrailARN ?? '',
        EventSelectors: eventSelectorResults.EventSelectors ?? [],
        AdvancedEventSelectors: eventSelectorResults.AdvancedEventSelectors ?? [],
      };
    } catch (e) {
      if (e instanceof TrailNotFoundException) {
        selectors = {
          TrailArn: '',
          EventSelectors: [],
          AdvancedEventSelectors: [],
        };
      }
    }
  }

  const jsonResults = await stringify(selectors, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
