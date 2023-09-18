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
  BadRequestException,
  DescribeOrganizationConfigurationCommand,
  DescribeOrganizationConfigurationCommandOutput,
  DescribePublishingDestinationCommand,
  DescribePublishingDestinationCommandOutput,
  GuardDutyClient,
  ListDetectorsCommand,
  ListOrganizationAdminAccountsCommand,
  ListPublishingDestinationsCommand,
  ListPublishingDestinationsCommandOutput,
} from '@aws-sdk/client-guardduty';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../../common/aws/backoff';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

type PublishingDestination = Omit<
  DescribePublishingDestinationCommandOutput,
  '$metadata' | 'PublishingFailureStartTimestamp' | 'DestinationId'
>;

export async function getGuardDutyOrganizationAdminAccounts(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: GuardDutyClient;
  if (credentials) {
    serviceClient = new GuardDutyClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new GuardDutyClient({ region: region });
  }
  const results = await throttlingBackOff(() => serviceClient.send(new ListOrganizationAdminAccountsCommand({})));
  const jsonResults = await stringify(results.AdminAccounts, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getGuardDutyPublishingDestinations(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: GuardDutyClient;
  if (credentials) {
    serviceClient = new GuardDutyClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new GuardDutyClient({ region: region });
  }
  let detectorId: string | undefined = undefined;
  const publishingDestinations: PublishingDestination[] = [];
  const detectorResults = await throttlingBackOff(() => serviceClient.send(new ListDetectorsCommand({})));
  if (detectorResults.DetectorIds!.length > 0) {
    detectorId = detectorResults.DetectorIds![0];
  }

  let publishingDestinationResults: ListPublishingDestinationsCommandOutput | undefined = undefined;
  if (detectorId) {
    publishingDestinationResults = await throttlingBackOff(() =>
      serviceClient.send(new ListPublishingDestinationsCommand({ DetectorId: detectorId })),
    );
  }

  if (
    detectorId &&
    publishingDestinationResults !== undefined &&
    publishingDestinationResults.Destinations &&
    publishingDestinationResults.Destinations?.length > 0
  ) {
    for (const destination of publishingDestinationResults.Destinations) {
      const destinationResult = await throttlingBackOff(() =>
        serviceClient.send(
          new DescribePublishingDestinationCommand({
            DetectorId: detectorId,
            DestinationId: destination.DestinationId,
          }),
        ),
      );
      publishingDestinations.push({
        DestinationType: destinationResult.DestinationType,
        DestinationProperties: destinationResult.DestinationProperties,
        Status: destinationResult.Status,
      });
    }
  }

  const jsonResults = await stringify(publishingDestinations, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function describeGuardDutyOrganizationConfig(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: GuardDutyClient;
  if (credentials) {
    serviceClient = new GuardDutyClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new GuardDutyClient({ region: region });
  }
  let detectorId: string | undefined = undefined;
  const detectorResults = await throttlingBackOff(() => serviceClient.send(new ListDetectorsCommand({})));
  if (detectorResults.DetectorIds!.length > 0) {
    detectorId = detectorResults.DetectorIds![0];
  }

  let organizationConfigResult: DescribeOrganizationConfigurationCommandOutput | undefined = undefined;
  if (detectorId) {
    try {
      organizationConfigResult = await throttlingBackOff(() =>
        serviceClient.send(new DescribeOrganizationConfigurationCommand({ DetectorId: detectorId })),
      );
    } catch (e) {
      if (e instanceof BadRequestException) {
        // do nothing
      } else {
        console.log(JSON.stringify(e));
      }
    }
  }

  const jsonResults = await stringify(
    {
      AutoEnableOrganizationMembers: organizationConfigResult?.AutoEnableOrganizationMembers ?? '',
      Features: organizationConfigResult?.Features ?? [],
    },
    { space: 1 },
  );
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
