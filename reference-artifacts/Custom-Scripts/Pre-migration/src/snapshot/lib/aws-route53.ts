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
  GetHostedZoneCommand,
  GetHostedZoneCommandOutput,
  HostedZone,
  HostedZoneSummary,
  ListHostedZonesCommand,
  ListHostedZonesByVPCCommand,
  Route53Client,
  VPCRegion,
} from '@aws-sdk/client-route-53';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { TableOperations } from '../common/dynamodb';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

export async function getHostedZonesForVpc(
  vpcId: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: Route53Client;
  if (credentials) {
    serviceClient = new Route53Client({ region: region, credentials: credentials, maxAttempts: 10 });
  } else {
    serviceClient = new Route53Client({ region: region, maxAttempts: 10 });
  }

  const hostedZones: HostedZoneSummary[] = [];
  let nextToken: string | undefined;
  do {
    const results = await serviceClient.send(
      new ListHostedZonesByVPCCommand({ VPCId: vpcId, VPCRegion: (region as VPCRegion), MaxItems: 20, NextToken: nextToken }));
    nextToken = results.NextToken;
    if (results.HostedZoneSummaries) {
      hostedZones.push(...results.HostedZoneSummaries);
    }
  } while (nextToken);

  const jsonResults = stringify(hostedZones, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getHostedZoneById(
  hostedZoneId: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: Route53Client;
  if (credentials) {
    serviceClient = new Route53Client({ region: region, credentials: credentials, maxAttempts: 10 });
  } else {
    serviceClient = new Route53Client({ region: region, maxAttempts: 10 });
  }

  type ModifiedHostedZone = Omit<GetHostedZoneCommandOutput, '$metadata'>;
  const results = await serviceClient.send(new GetHostedZoneCommand({ Id: hostedZoneId }));
  const hostedZone: ModifiedHostedZone = {
    HostedZone: results.HostedZone,
    DelegationSet: results.DelegationSet,
    VPCs: results.VPCs,
  };

  const jsonResults = stringify(hostedZone, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function snapshotHostedZones(
  tableName: string,
  homeRegion: string,
  accountId: string,
  region: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  const snapshotTable = new TableOperations(tableName, homeRegion);
  let serviceClient: Route53Client;
  if (credentials) {
    serviceClient = new Route53Client({ region: region, credentials: credentials, maxAttempts: 10 });
  } else {
    serviceClient = new Route53Client({ region: region, maxAttempts: 10 });
  }
  const hostedZones: HostedZone[] = [];
  let nextToken: string | undefined;
  do {
    const results = await serviceClient.send(new ListHostedZonesCommand({ Marker: nextToken }));
    nextToken = results.NextMarker;
    if (results.HostedZones) {
      hostedZones.push(...results.HostedZones);
    }
  } while (nextToken);

  for (const hostedZone of hostedZones) {
    // write basic data about hosted zone
    const hostedZoneJson = await stringify(hostedZone, { space: 1 });
    const hostedZoneHash = computeHash(hostedZoneJson);
    await snapshotTable.writeResource({
      accountId: accountId,
      region: region,
      resourceName: `hosted-zone-${hostedZone.Name}`,
      preMigration: preMigration,
      data: { jsonData: hostedZoneJson, hash: hostedZoneHash },
    });

    // get more details and write it
    const getHostedZoneByIdResults = await getHostedZoneById(hostedZone.Id!, region, credentials);
    await snapshotTable.writeResource({
      accountId: accountId,
      region: region,
      resourceName: `hosted-zone-details-${hostedZone.Name}`,
      preMigration: preMigration,
      data: getHostedZoneByIdResults,
    });
  }
}
