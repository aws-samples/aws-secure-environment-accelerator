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
  S3Client,
  GetBucketLifecycleConfigurationCommand,
  GetBucketLifecycleConfigurationCommandOutput,
  GetBucketLocationCommand,
  GetBucketPolicyCommand,
  GetBucketReplicationCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import { S3ControlClient, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3-control';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../../common/aws/backoff';
import { TableOperations } from '../common/dynamodb';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

export async function getS3PublicAccessBlock(
  accountId: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: S3ControlClient;
  if (credentials) {
    serviceClient = new S3ControlClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new S3ControlClient({ region: region });
  }
  const results = await throttlingBackOff(() =>
    serviceClient.send(new GetPublicAccessBlockCommand({ AccountId: accountId })),
  );
  const jsonResults = await stringify(results.PublicAccessBlockConfiguration, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

async function getS3LifecycleConfiguration(
  bucketName: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: S3Client;
  if (credentials) {
    serviceClient = new S3Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new S3Client({ region: region });
  }

  let results: GetBucketLifecycleConfigurationCommandOutput;
  try {
    results = await throttlingBackOff(() =>
      serviceClient.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucketName })),
    );
  } catch (e: any) {
    if (e.name === 'NoSuchLifecycleConfiguration') {
      const jsonResults = await stringify('{}', { space: 1 });
      const hash = computeHash(jsonResults);
      return { jsonData: jsonResults, hash: hash };
    } else {
      console.log(JSON.stringify(e));
      throw new Error(e.name);
    }
  }
  const jsonResults = await stringify(results!.Rules, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

async function getS3BucketPolicy(
  bucketName: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: S3Client;
  if (credentials) {
    serviceClient = new S3Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new S3Client({ region: region });
  }
  try {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new GetBucketPolicyCommand({ Bucket: bucketName })),
    );
    const jsonResults = await stringify(results.Policy, { space: 1 });
    const hash = computeHash(jsonResults);
    return { jsonData: jsonResults, hash: hash };
  } catch (e: any) {
    if (e.Code === 'NoSuchBucketPolicy') {
      const jsonResults = '{}';
      const hash = computeHash(jsonResults);
      return { jsonData: jsonResults, hash: hash };
    } else {
      console.log(JSON.stringify(e));
      throw new Error(`Unable to get lifecycle policy for bucket ${bucketName}`);
    }
  }
}

export async function getS3BucketReplication(
  bucketName: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: S3Client;
  if (credentials) {
    serviceClient = new S3Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new S3Client({ region: region });
  }
  try {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new GetBucketReplicationCommand({ Bucket: bucketName })),
    );
    const jsonResults = await stringify(results.ReplicationConfiguration, { space: 1 });
    const hash = computeHash(jsonResults);
    return { jsonData: jsonResults, hash: hash };
  } catch (e: any) {
    if (e.Code === 'NoSuchBucketReplication' || e.name === 'ReplicationConfigurationNotFoundError') {
      const jsonResults = '{}';
      const hash = computeHash(jsonResults);
      return { jsonData: jsonResults, hash: hash };
    } else {
      console.log(JSON.stringify(e));
      throw new Error(`Unable to get replication for bucket ${bucketName}`);
    }
  }
}

export async function snapshotS3Resources(
  tableName: string,
  homeRegion: string,
  prefix: string,
  accountId: string,
  region: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  const snapshotTable = new TableOperations(tableName, homeRegion);
  let serviceClient: S3Client;
  if (credentials) {
    serviceClient = new S3Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new S3Client({ region: region });
  }

  const bucketPrefix = prefix.toLowerCase();
  const results = await throttlingBackOff(() => serviceClient.send(new ListBucketsCommand({})));
  for (const bucket of results.Buckets!) {
    if (bucket.Name?.startsWith(bucketPrefix)) {
      const locationResults = await throttlingBackOff(() =>
        serviceClient.send(new GetBucketLocationCommand({ Bucket: bucket.Name })),
      );
      const bucketRegion = locationResults.LocationConstraint ?? 'us-east-1';
      const s3LifecycleResults = await getS3LifecycleConfiguration(bucket.Name!, bucketRegion, credentials);
      await snapshotTable.writeResource({
        accountId: accountId,
        region: region,
        resourceName: `s3-lifecycle-config-${bucket.Name!}`,
        preMigration: preMigration,
        data: s3LifecycleResults,
      });
      const s3PolicyResults = await getS3BucketPolicy(bucket.Name!, bucketRegion, credentials);
      await snapshotTable.writeResource({
        accountId: accountId,
        region: region,
        resourceName: `s3-bucket-policy-${bucket.Name!}`,
        preMigration: preMigration,
        data: s3PolicyResults,
      });
      const s3BucketReplicationResults = await getS3BucketReplication(bucket.Name!, bucketRegion, credentials);
      await snapshotTable.writeResource({
        accountId: accountId,
        region: region,
        resourceName: `s3-bucket-replication-${bucket.Name!}`,
        preMigration: preMigration,
        data: s3BucketReplicationResults,
      });
    }
  }
}
