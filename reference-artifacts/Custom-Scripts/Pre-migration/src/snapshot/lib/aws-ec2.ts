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
  DescribeKeyPairsCommand,
  DescribeTransitGatewayAttachmentsCommand,
  DescribeTransitGatewayPeeringAttachmentsCommand,
  DescribeVpcsCommand,
  DescribeVpcEndpointsCommand,
  DescribeVpcEndpointServiceConfigurationsCommand,
  DescribeVpcEndpointServicePermissionsCommand,
  EC2Client,
  GetEbsDefaultKmsKeyIdCommand,
  GetEbsEncryptionByDefaultCommand,
  TransitGatewayAttachment,
  TransitGatewayPeeringAttachment,
} from '@aws-sdk/client-ec2';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { getHostedZonesForVpc } from './aws-route53';

import { SnapshotData } from '../common/types';
import { computeHash } from '../common/hash';
import { TableOperations } from '../common/dynamodb';
import { throttlingBackOff } from '../../common/aws/backoff';

const stringify = require('fast-json-stable-stringify');

export async function getEbsEncryptionEnabled(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: EC2Client;
  if (credentials) {
    serviceClient = new EC2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new EC2Client({ region: region });
  }
  const results = await throttlingBackOff(() => serviceClient.send(new GetEbsEncryptionByDefaultCommand({})));
  const jsonResults = await stringify(results.EbsEncryptionByDefault, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getEbsEncryptionKmsKey(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: EC2Client;
  if (credentials) {
    serviceClient = new EC2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new EC2Client({ region: region });
  }
  const results = await throttlingBackOff(() => serviceClient.send(new GetEbsDefaultKmsKeyIdCommand({})));
  const jsonResults = await stringify(results.KmsKeyId, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function describeTransitGatewayAttachments(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: EC2Client;
  if (credentials) {
    serviceClient = new EC2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new EC2Client({ region: region });
  }

  const transitGatewayAttachments: TransitGatewayAttachment[] = [];
  let nextToken: string | undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeTransitGatewayAttachmentsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.TransitGatewayAttachments) {
      transitGatewayAttachments.push(...results.TransitGatewayAttachments);
    }
  } while (nextToken);

  const jsonResults = await stringify(transitGatewayAttachments, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function describeTransitGatewayPeeringAttachments(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: EC2Client;
  if (credentials) {
    serviceClient = new EC2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new EC2Client({ region: region });
  }

  const transitGatewayPeeringAttachments: TransitGatewayPeeringAttachment[] = [];
  let nextToken: string | undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeTransitGatewayPeeringAttachmentsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.TransitGatewayPeeringAttachments) {
      transitGatewayPeeringAttachments.push(...results.TransitGatewayPeeringAttachments);
    }
  } while (nextToken);

  const jsonResults = await stringify(transitGatewayPeeringAttachments, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function describeKeyPairs(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: EC2Client;
  if (credentials) {
    serviceClient = new EC2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new EC2Client({ region: region });
  }
  const results = await throttlingBackOff(() => serviceClient.send(new DescribeKeyPairsCommand({})));
  const jsonResults = await stringify(results.KeyPairs, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function snapshotVpcResources(
  tableName: string,
  homeRegion: string,
  accountId: string,
  region: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  const snapshotTable = new TableOperations(tableName, homeRegion);
  let serviceClient: EC2Client;
  if (credentials) {
    serviceClient = new EC2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new EC2Client({ region: region });
  }

  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeVpcsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.Vpcs) {
      for (const vpc of results.Vpcs) {
        const vpcJson = await stringify(vpc, { space: 1 });
        const vpcHash = computeHash(vpcJson);
        await snapshotTable.writeResource({
          accountId: accountId,
          region: region,
          resourceName: `${vpc.VpcId!}`,
          preMigration: preMigration,
          data: { jsonData: vpcJson, hash: vpcHash },
        });
        const vpcHostedZoneResults = await getHostedZonesForVpc(vpc.VpcId!, region, credentials);
        await snapshotTable.writeResource({
          accountId: accountId,
          region: region,
          resourceName: `vpc-hosted-zone-${vpc.VpcId!}`,
          preMigration: preMigration,
          data: vpcHostedZoneResults,
        });
      }
    }
  } while (nextToken);
}

async function getVpcEndpointServicePermissions(
  serviceId: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: EC2Client;
  if (credentials) {
    serviceClient = new EC2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new EC2Client({ region: region });
  }
  const results = await throttlingBackOff(() =>
    serviceClient.send(new DescribeVpcEndpointServicePermissionsCommand({ ServiceId: serviceId })),
  );
  const jsonResults = await stringify(results.AllowedPrincipals, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function snapshotVpcEndpoints(
  tableName: string,
  homeRegion: string,
  accountId: string,
  region: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  const snapshotTable = new TableOperations(tableName, homeRegion);
  let serviceClient: EC2Client;
  if (credentials) {
    serviceClient = new EC2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new EC2Client({ region: region });
  }

  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeVpcEndpointsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.VpcEndpoints) {
      for (const vpcEndpoint of results.VpcEndpoints) {
        const vpcEndpointJson = await stringify(vpcEndpoint, { space: 1 });
        const vpcEndpointHash = computeHash(vpcEndpointJson);
        await snapshotTable.writeResource({
          accountId: accountId,
          region: region,
          resourceName: `vpc-endpoint-${vpcEndpoint.VpcEndpointId}`,
          preMigration: preMigration,
          data: { jsonData: vpcEndpointJson, hash: vpcEndpointHash },
        });
      }
    }
  } while (nextToken);
}

export async function snapshotVpcEnpointServices(
  tableName: string,
  homeRegion: string,
  accountId: string,
  region: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  const snapshotTable = new TableOperations(tableName, homeRegion);
  let serviceClient: EC2Client;
  if (credentials) {
    serviceClient = new EC2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new EC2Client({ region: region });
  }

  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeVpcEndpointServiceConfigurationsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.ServiceConfigurations) {
      for (const vpcEndpointService of results.ServiceConfigurations) {
        const vpcEndpointServiceJson = await stringify(vpcEndpointService, { space: 1 });
        const vpcEndpointServiceHash = computeHash(vpcEndpointServiceJson);
        await snapshotTable.writeResource({
          accountId: accountId,
          region: region,
          resourceName: `${vpcEndpointService.ServiceId}`,
          preMigration: preMigration,
          data: { jsonData: vpcEndpointServiceJson, hash: vpcEndpointServiceHash },
        });
        const vpcHostedZoneResults = await getVpcEndpointServicePermissions(
          vpcEndpointService.ServiceId!,
          region,
          credentials,
        );
        await snapshotTable.writeResource({
          accountId: accountId,
          region: region,
          resourceName: `vpc-service-enpoint-permissions-${vpcEndpointService.ServiceId}`,
          preMigration: preMigration,
          data: vpcHostedZoneResults,
        });
      }
    }
  } while (nextToken);
}
