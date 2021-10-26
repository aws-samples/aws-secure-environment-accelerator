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
import * as iam from '@aws-cdk/aws-iam';
import { createRoleName, createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import * as kinesisfirehose from '@aws-cdk/aws-kinesisfirehose';
import { AccountStack } from '../../../common/account-stacks';
import { JsonOutputValue } from '../../../common/json-output';

export interface CentralLoggingToS3Step1Props {
  accountStack: AccountStack;
  bucketArn: string;
}

/**
 * Enable Central Logging to S3 in in subaccount accounts by creating kinesis firehose stream
 *  points to s3 buckt in "log-archive" account Step 1
 */
export async function step1(props: CentralLoggingToS3Step1Props) {
  const { accountStack, bucketArn } = props;
  // Setup for CloudWatch logs settings in sub account
  await cwlCentralLoggingSettings({
    scope: accountStack,
    bucketArn,
  });
}

/**
 * Create initial Setup in Sub Account for centralized logging
 * 5.15b - READY - Centralize CWL - Part 2
 */
async function cwlCentralLoggingSettings(props: { scope: cdk.Construct; bucketArn: string }) {
  const { scope, bucketArn } = props;

  // Create IAM Role for reading logs from stream and push to destination
  new iam.Role(scope, 'CWL-Logs-Stream-Role', {
    roleName: createRoleName('CWL-Stream-Role'),
    assumedBy: new iam.ServicePrincipal('logs.amazonaws.com'),
    path: '/service-role/',
    managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
  });

  // Creating IAM role for Kinesis Delivery Stream Role
  const kinesisStreamRole = new iam.Role(scope, 'CWL-Kinesis-Stream-Role', {
    roleName: createRoleName('Kinesis-Stream-Role'),
    assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
  });

  const kinesisStreamPolicy = new iam.Policy(scope, 'CWL-Kinesis-Stream-Policy', {
    roles: [kinesisStreamRole],
    statements: [
      new iam.PolicyStatement({
        resources: [
          bucketArn,
          `${bucketArn}/*`,
          //  `${bucketArn}/${CLOUD_WATCH_CENTRAL_LOGGING_BUCKET_PREFIX}${cdk.Aws.ACCOUNT_ID}/${cdk.Aws.REGION}*`
        ],
        actions: [
          's3:AbortMultipartUpload',
          's3:GetBucketLocation',
          's3:GetObject',
          's3:ListBucket',
          's3:ListBucketMultipartUploads',
          's3:PutObject',
          's3:PutObjectAcl',
        ],
      }),
      new iam.PolicyStatement({
        resources: ['*'],
        actions: [
          'kinesis:DescribeStream',
          'kinesis:GetShardIterator',
          'kinesis:GetRecords',
          'kinesis:ListShards',
          'kms:Decrypt',
          'logs:PutLogEvents',
          'lambda:GetFunctionConfiguration',
          'lambda:InvokeFunction',
        ],
      }),
    ],
  });

  const kinesisDeliveryStream = new kinesisfirehose.CfnDeliveryStream(scope, 'Kinesis-Firehouse-Stream', {
    deliveryStreamName: createName({
      name: 'Kinesis-Delivery-Stream',
    }),
    deliveryStreamType: 'DirectPut',
    extendedS3DestinationConfiguration: {
      bucketArn,
      bufferingHints: {
        intervalInSeconds: 60,
        sizeInMBs: 50,
      },
      compressionFormat: 'UNCOMPRESSED',
      roleArn: kinesisStreamRole.roleArn,
      // prefix: `${CLOUD_WATCH_CENTRAL_LOGGING_BUCKET_PREFIX}${cdk.Aws.ACCOUNT_ID}/${cdk.Aws.REGION}/`,
      cloudWatchLoggingOptions: {
        enabled: true,
        creationStack: [],
        logGroupName: 'CloudTrail/Landing-Zone-Logs',
        logStreamName: 'custom',
      },
    },
  });
  kinesisDeliveryStream.node.addDependency(kinesisStreamPolicy);

  // Store LogDestination ARN in output so that subsequent phases can access the output
  new JsonOutputValue(scope, `CloudWatchCentralLoggingOutput`, {
    type: 'LogDeliveryStream',
    value: {
      logDestination: kinesisDeliveryStream.attrArn,
    },
  });
}
