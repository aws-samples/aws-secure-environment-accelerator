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
  DescribeHubCommand,
  DescribeOrganizationConfigurationCommand,
  DescribeOrganizationConfigurationCommandOutput,
  DescribeStandardsControlsCommand,
  GetAdministratorAccountCommand,
  GetEnabledStandardsCommand,
  GetFindingAggregatorCommand,
  InvalidAccessException,
  ListFindingAggregatorsCommand,
  SecurityHubClient,
  StandardsControl,
  StandardsSubscription,
} from '@aws-sdk/client-securityhub';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { SnapshotData } from '../common/types';
import { computeHash } from '../common/hash';
import { throttlingBackOff } from '../../common/aws/backoff';

const stringify = require('fast-json-stable-stringify');

export async function getSecurityHubOrganizationConfig(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: SecurityHubClient;
  if (credentials) {
    serviceClient = new SecurityHubClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new SecurityHubClient({ region: region });
  }
  let results: DescribeOrganizationConfigurationCommandOutput | undefined;
  try {
    results = await throttlingBackOff(() => serviceClient.send(new DescribeOrganizationConfigurationCommand({})));
  } catch (e) {
    if (e instanceof InvalidAccessException) {
      // catch exception if not organization admin account
    }
  }

  let jsonResults: string = '{}';
  if (results) {
    jsonResults = await stringify(
      {
        AutoEnable: results.AutoEnable,
        AutoEnableStandards: results.AutoEnableStandards,
      },
      { space: 1 },
    );
  }
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getSecurityHubStatus(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: SecurityHubClient;
  if (credentials) {
    serviceClient = new SecurityHubClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new SecurityHubClient({ region: region });
  }

  const results = await throttlingBackOff(() => serviceClient.send(new DescribeHubCommand({})));

  const jsonResults = await stringify(
    {
      HubArn: results.HubArn,
      AutoEnableControls: results.AutoEnableControls,
      ControlFindingGenerator: results.ControlFindingGenerator,
    },
    { space: 1 },
  );
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getSecurityHubStandardsSubscriptions(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: SecurityHubClient;
  if (credentials) {
    serviceClient = new SecurityHubClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new SecurityHubClient({ region: region });
  }

  const standardsSubscriptions: StandardsSubscription[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new GetEnabledStandardsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.StandardsSubscriptions) {
      standardsSubscriptions.push(...results.StandardsSubscriptions);
    }
  } while (nextToken);

  const jsonResults = await stringify(standardsSubscriptions, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getSecurityHubDisabledControls(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: SecurityHubClient;
  if (credentials) {
    serviceClient = new SecurityHubClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new SecurityHubClient({ region: region });
  }

  const subscriptionArns: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new GetEnabledStandardsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.StandardsSubscriptions) {
      for (const subscriptionStandard of results.StandardsSubscriptions) {
        subscriptionArns.push(subscriptionStandard.StandardsSubscriptionArn!);
      }
    }
  } while (nextToken);

  let disabledControls: StandardsControl[] = [];
  let controlsNextToken: string | undefined = undefined;
  for (const subscriptionArn of subscriptionArns) {
    do {
      const results = await throttlingBackOff(() =>
        serviceClient.send(
          new DescribeStandardsControlsCommand({
            StandardsSubscriptionArn: subscriptionArn,
            NextToken: controlsNextToken,
          }),
        ),
      );
      controlsNextToken = results.NextToken;
      if (results.Controls) {
        const filteredControls = results.Controls.filter((item) => item.ControlStatus === 'DISABLED');
        disabledControls.push(...filteredControls);
      }
    } while (controlsNextToken);
  }

  const jsonResults = await stringify(disabledControls, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getSecurityHubAdministratorAccount(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: SecurityHubClient;
  if (credentials) {
    serviceClient = new SecurityHubClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new SecurityHubClient({ region: region });
  }

  const results = await throttlingBackOff(() => serviceClient.send(new GetAdministratorAccountCommand({})));

  const jsonResults = await stringify(results.Administrator, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getSecurityHubFindingAggregators(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: SecurityHubClient;
  if (credentials) {
    serviceClient = new SecurityHubClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new SecurityHubClient({ region: region });
  }

  const findingAggregatorArns: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new ListFindingAggregatorsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.FindingAggregators) {
      for (const findingAggregator of results.FindingAggregators) {
        findingAggregatorArns.push(findingAggregator.FindingAggregatorArn!);
      }
    }
  } while (nextToken);

  let findingAggregators: {
    FindingAggregationRegion: string | undefined;
    FindingAggregatorArn: string | undefined;
    RegionLinkingMode: string | undefined;
    Regions: string[] | undefined;
  }[] = [];
  for (const findingAggregatorAn of findingAggregatorArns) {
    const findingAggregatorResults = await throttlingBackOff(() =>
      serviceClient.send(new GetFindingAggregatorCommand({ FindingAggregatorArn: findingAggregatorAn })),
    );
    findingAggregators.push({
      FindingAggregationRegion: findingAggregatorResults.FindingAggregationRegion,
      FindingAggregatorArn: findingAggregatorResults.FindingAggregatorArn,
      RegionLinkingMode: findingAggregatorResults.RegionLinkingMode,
      Regions: findingAggregatorResults.Regions,
    });
  }

  const jsonResults = await stringify(findingAggregators, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}