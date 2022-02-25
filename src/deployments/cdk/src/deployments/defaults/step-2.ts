/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '../../utils/accounts';
import { createDefaultS3Bucket, createDefaultS3Key } from './shared';
import { CfnAccountBucketOutput, AccountBuckets } from './outputs';
import { CfnResourceCleanupOutput } from '../cleanup/outputs';

export interface DefaultsStep2Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
  centralLogBucket: s3.IBucket;
  prefix: string;
}

export type DefaultsStep2Result = AccountBuckets;

export async function step2(props: DefaultsStep2Props): Promise<DefaultsStep2Result> {
  return createDefaultS3Buckets(props);
}

function createDefaultS3Buckets(props: DefaultsStep2Props) {
  const { accountStacks, accounts, centralLogBucket, config } = props;

  const buckets: { [accountKey: string]: s3.IBucket } = {};

  const logAccountKey = config['global-options']['central-log-services'].account;
  const logAccountId = getAccountId(accounts, logAccountKey)!;

  // We already created the log bucket in step 1
  buckets[logAccountKey] = centralLogBucket;

  // Next create all other buckets and use the log bucket to replicate into
  for (const [accountKey, _] of config.getAccountConfigs()) {
    if (buckets[accountKey]) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const key = createDefaultS3Key({
      accountStack,
      prefix: props.prefix,
    });

    const defaultLogRetention = config['global-options']['default-s3-retention'];

    const accountConfig = config.getAccountByKey(accountStack.accountKey);
    const logRetention = accountConfig['s3-retention'] ?? defaultLogRetention;

    const bucket = createDefaultS3Bucket({
      accountStack,
      encryptionKey: key.encryptionKey,
      logRetention,
    });

    // Provide permissions to write VPC flow logs to the bucket
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [`${bucket.bucketArn}/${cdk.Aws.ACCOUNT_ID}/*`],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
          },
        },
      }),
    );

    // Provide permissions to read bucket for VPC flow logs
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        actions: ['s3:GetBucketAcl', 's3:ListBucket'],
        resources: [`${bucket.bucketArn}`],
      }),
    );

    // Allow only https requests
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [bucket.bucketArn, bucket.arnForObjects('*')],
        principals: [new iam.AnyPrincipal()],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
        effect: iam.Effect.DENY,
      }),
    );

    buckets[accountKey] = bucket;

    new CfnAccountBucketOutput(accountStack, 'DefaultBucketOutput', {
      bucketArn: bucket.bucketArn,
      bucketName: bucket.bucketName,
      encryptionKeyArn: bucket.encryptionKey!.keyArn,
      region: cdk.Aws.REGION,
      encryptionKeyId: bucket.encryptionKey!.keyId,
      encryptionKeyName: key.alias,
    });
  }

  // Finding master account key from the configuration
  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);
  // Writing to outputs to avoid future execution of Default bucket policy clean up custom resource
  new CfnResourceCleanupOutput(masterAccountStack, `ResourceCleanupOutput${masterAccountKey}`, {
    bucketPolicyCleanup: true,
  });

  return buckets;
}
