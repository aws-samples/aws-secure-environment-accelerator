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
  DescribeKeyCommand,
  GetKeyPolicyCommand,
  ListGrantsCommand,
  ListKeysCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../../common/aws/backoff';
import { TableOperations } from '../common/dynamodb';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

async function getKmsKeyGrants(
  keyId: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: KMSClient;
  if (credentials) {
    serviceClient = new KMSClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new KMSClient({ region: region });
  }
  const results = await throttlingBackOff(() => serviceClient.send(new ListGrantsCommand({ KeyId: keyId })));
  const jsonResults = await stringify(results.Grants, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

async function describeKmsKey(
  keyId: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: KMSClient;
  if (credentials) {
    serviceClient = new KMSClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new KMSClient({ region: region });
  }
  const results = await throttlingBackOff(() => serviceClient.send(new DescribeKeyCommand({ KeyId: keyId })));
  const jsonResults = await stringify(results.KeyMetadata, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

async function getKmsKeyPolicy(
  keyId: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: KMSClient;
  if (credentials) {
    serviceClient = new KMSClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new KMSClient({ region: region });
  }
  const results = await throttlingBackOff(() =>
    serviceClient.send(new GetKeyPolicyCommand({ KeyId: keyId, PolicyName: 'default' })),
  );
  const jsonResults = await stringify(results.Policy, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function snapshotKmsKeys(
  tableName: string,
  homeRegion: string,
  accountId: string,
  region: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  const snapshotTable = new TableOperations(tableName, homeRegion);
  let serviceClient: KMSClient;
  if (credentials) {
    serviceClient = new KMSClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new KMSClient({ region: region });
  }

  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() => serviceClient.send(new ListKeysCommand({ Marker: nextToken })));
    nextToken = results.NextMarker;
    if (results.Keys) {
      for (const key of results.Keys) {
        const keyResults = await describeKmsKey(key.KeyId!, region, credentials);
        await snapshotTable.writeResource({
          accountId: accountId,
          region: region,
          resourceName: `kms-key-${key.KeyId}`,
          preMigration: preMigration,
          data: keyResults,
        });
        const keyGrantResults = await getKmsKeyGrants(key.KeyId!, region, credentials);
        await snapshotTable.writeResource({
          accountId: accountId,
          region: region,
          resourceName: `kms-key-grant-${key.KeyId}`,
          preMigration: preMigration,
          data: keyGrantResults,
        });
        const keyPolicyResults = await getKmsKeyPolicy(key.KeyId!, region, credentials);
        await snapshotTable.writeResource({
          accountId: accountId,
          region: region,
          resourceName: `kms-key-policy-${key.KeyId}`,
          preMigration: preMigration,
          data: keyPolicyResults,
        });
      }
    }
  } while (nextToken);
}
