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
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import * as iam from '@aws-cdk/aws-iam';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as s3 from '@aws-cdk/aws-s3';
import * as logs from '@aws-cdk/aws-logs';
import * as kinesisfirehose from '@aws-cdk/aws-kinesisfirehose';
import { AccountStacks } from '../../../common/account-stacks';
import { CLOUD_WATCH_CENTRAL_LOGGING_BUCKET_PREFIX } from '@aws-accelerator/common/src/util/constants';
import * as c from '@aws-accelerator/common-config';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { CfnLogDestinationOutput } from './outputs';
import { Organizations } from '@aws-accelerator/custom-resource-organization';

export interface CentralLoggingToS3Step1Props {
  accountStacks: AccountStacks;
  logBucket: s3.IBucket;
  outputs: StackOutput[];
  config: c.AcceleratorConfig;
  acceleratorPrefix: string;
}

/**
 * Enable Central Logging to S3 in "log-archive" account Step 1
 */
export async function step1(props: CentralLoggingToS3Step1Props) {
  const { accountStacks, logBucket, config, outputs, acceleratorPrefix } = props;
  // Setup for CloudWatch logs storing in logs account for org
  const centralLogServices = config['global-options']['central-log-services'];
  const cwlRegionsConfig = config['global-options']['additional-cwl-regions'];
  if (!cwlRegionsConfig[centralLogServices.region]) {
    cwlRegionsConfig[centralLogServices.region] = {
      'kinesis-stream-shard-count': centralLogServices['kinesis-stream-shard-count'],
    };
  }

  const cwlLogStreamRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: centralLogServices.account,
    roleKey: 'CWLLogsStreamRole',
  });

  const cwlKinesisStreamRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: centralLogServices.account,
    roleKey: 'CWLKinesisStreamRole',
  });

  if (!cwlLogStreamRoleOutput || !cwlKinesisStreamRoleOutput) {
    console.error(`Skipping CWL Central logging setup due to unavailability of roles in output`);
    return;
  }
  const logAccountStack = accountStacks.tryGetOrCreateAccountStack(
    centralLogServices.account,
    centralLogServices.region,
  );
  if (!logAccountStack) {
    throw new Error(
      `Cannot find mandatory ${centralLogServices.account} account in home region ${centralLogServices.region}.`,
    );
  }
  const organizations = new Organizations(logAccountStack, 'Organizations');

  // Setting up in default "central-log-services" and "additional-cwl-regions" region
  for (const [region, regionConfig] of Object.entries(cwlRegionsConfig)) {
    // Setup CWL Central logging in default region
    const logAccountStack = accountStacks.tryGetOrCreateAccountStack(centralLogServices.account, region);
    if (!logAccountStack) {
      console.error(
        `Cannot find account stack ${centralLogServices.account}: ${region} while setting up cloudWatch central logging to S3`,
      );
      continue;
    }
    await cwlSettingsInLogArchive({
      scope: logAccountStack,
      bucketArn: logBucket.bucketArn,
      shardCount: regionConfig['kinesis-stream-shard-count'],
      logStreamRoleArn: cwlLogStreamRoleOutput.roleArn,
      kinesisStreamRoleArn: cwlKinesisStreamRoleOutput.roleArn,
      orgId: organizations.organizationId,
      acceleratorPrefix,
    });
  }
}

/**
 * Create initial Setup in Log Archive Account for centralized logging for sub accounts in single S3 bucket
 * 5.15b - READY - Centralize CWL - Part 2
 */
async function cwlSettingsInLogArchive(props: {
  scope: cdk.Construct;
  bucketArn: string;
  logStreamRoleArn: string;
  kinesisStreamRoleArn: string;
  orgId: string;
  acceleratorPrefix: string;
  shardCount?: number;
}) {
  const { scope, bucketArn, logStreamRoleArn, kinesisStreamRoleArn, shardCount, orgId, acceleratorPrefix } = props;

  // Create Kinesis Stream for Logs streaming
  const logsStream = new kinesis.Stream(scope, 'Logs-Stream', {
    streamName: createName({
      name: 'Kinesis-Logs-Stream',
      suffixLength: 0,
    }),
    encryption: kinesis.StreamEncryption.UNENCRYPTED,
    shardCount,
  });

  const destinationName = createName({
    name: 'LogDestination',
    suffixLength: 0,
  });

  const destinationPolicy = new iam.PolicyDocument({
    statements: [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['logs:PutSubscriptionFilter'],
        resources: [`arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:destination:${destinationName}`],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': orgId,
          },
          ArnLike: {
            'aws:PrincipalARN': [`arn:aws:iam::*:role/${acceleratorPrefix}*`],
          },
        },
      }),
    ],
  });
  const destinationPolicyStr = JSON.stringify(destinationPolicy.toJSON());
  // Create AWS Logs Destination
  const logDestination = new logs.CfnDestination(scope, 'Log-Destination', {
    destinationName,
    targetArn: logsStream.streamArn,
    roleArn: logStreamRoleArn,
    destinationPolicy: destinationPolicyStr,
  });

  new kinesisfirehose.CfnDeliveryStream(scope, 'Kinesis-Firehouse-Stream', {
    deliveryStreamName: createName({
      name: 'Firehose-Delivery-Stream',
    }),
    deliveryStreamType: 'KinesisStreamAsSource',
    kinesisStreamSourceConfiguration: {
      kinesisStreamArn: logsStream.streamArn,
      roleArn: kinesisStreamRoleArn,
    },
    extendedS3DestinationConfiguration: {
      bucketArn,
      bufferingHints: {
        intervalInSeconds: 60,
        sizeInMBs: 50,
      },
      compressionFormat: 'UNCOMPRESSED',
      roleArn: kinesisStreamRoleArn,
      prefix: CLOUD_WATCH_CENTRAL_LOGGING_BUCKET_PREFIX,
    },
  });

  // Store LogDestination ARN in output so that subsequent phases can access the output
  new CfnLogDestinationOutput(scope, `CloudWatchCentralLoggingOutput`, {
    destinationArn: logDestination.attrArn,
    destinationName: logDestination.destinationName,
    destinationKey: 'CwlCentralLogDestination',
  });
}
