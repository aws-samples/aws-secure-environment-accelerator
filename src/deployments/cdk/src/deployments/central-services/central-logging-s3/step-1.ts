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
import * as lambda from '@aws-cdk/aws-lambda';
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

import path from 'path';

export interface CentralLoggingToS3Step1Props {
  accountStacks: AccountStacks;
  logBucket: s3.IBucket;
  outputs: StackOutput[];
  config: c.AcceleratorConfig;
}

/**
 * Enable Central Logging to S3 in "log-archive" account Step 1
 */
export async function step1(props: CentralLoggingToS3Step1Props) {
  const { accountStacks, logBucket, config, outputs } = props;
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
      dynamicS3LogPartitioning: centralLogServices['dynamic-s3-log-partitioning'],
      region,
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
  shardCount?: number;
  dynamicS3LogPartitioning?: c.S3LogPartition[];
  region: string;
}) {
  
  const {
    scope,
    orgId,
    bucketArn,
    logStreamRoleArn,
    kinesisStreamRoleArn,
    shardCount,
    dynamicS3LogPartitioning,
    region,
  } = props;

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
            'aws:PrincipalOrgID': [orgId],
          },
        },
      }),
    ],
  });
  const enforcedPolicy = new iam.Policy(scope, 'Log-Destination-Policy', {
    force: true,
    document: destinationPolicy,
  });
  const destinationPolicyStr = JSON.stringify(enforcedPolicy.document.toJSON());
  // Create AWS Logs Destination
  const logDestination = new logs.CfnDestination(scope, 'Log-Destination', {
    destinationName,
    targetArn: logsStream.streamArn,
    roleArn: logStreamRoleArn,
    destinationPolicy: destinationPolicyStr,
  });

  const lambdaPath = require.resolve('@aws-accelerator/deployments-runtime');
  const lambdaDir = path.dirname(lambdaPath);
  const lambdaCode = lambda.Code.fromAsset(lambdaDir);

  const firhosePrefixProcessingLambda = new lambda.Function(scope, `FirehosePrefixProcessingLambda`, {
    runtime: lambda.Runtime.NODEJS_14_X,
    code: lambdaCode,
    handler: 'index.firehoseCustomPrefix',
    memorySize: 2048,
    timeout: cdk.Duration.minutes(5),
    environment: {
      LOG_PREFIX: CLOUD_WATCH_CENTRAL_LOGGING_BUCKET_PREFIX,
      DYNAMIC_S3_LOG_PARTITIONING_MAPPING: dynamicS3LogPartitioning ? JSON.stringify(dynamicS3LogPartitioning) : '',
    },
  });

  const kinesisStreamRole = iam.Role.fromRoleArn(scope, `KinesisStreamRoleLookup-${region}`, kinesisStreamRoleArn, {
    mutable: true,
  });

  kinesisStreamRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      resources: [firhosePrefixProcessingLambda.functionArn],
      actions: ['lambda:InvokeFunction'],
    }),
  );

  new kinesisfirehose.CfnDeliveryStream(scope, 'Kinesis-Firehouse-Stream-Dynamic-Partitioning', {
    deliveryStreamName: createName({
      name: 'Firehose-Delivery-Stream-Partition',
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
        sizeInMBs: 64, // Minimum with dynamic partitioning
      },
      compressionFormat: 'UNCOMPRESSED',
      roleArn: kinesisStreamRoleArn,
      dynamicPartitioningConfiguration: {
        enabled: true,
      },
      errorOutputPrefix: `${CLOUD_WATCH_CENTRAL_LOGGING_BUCKET_PREFIX}/processing-failed`,
      prefix: '!{partitionKeyFromLambda:dynamicPrefix}',
      processingConfiguration: {
        enabled: true,
        processors: [
          {
            type: 'Lambda',
            parameters: [
              {
                parameterName: 'LambdaArn',
                parameterValue: firhosePrefixProcessingLambda.functionArn,
              },
              {
                parameterName: 'NumberOfRetries',
                parameterValue: '3',
              },
            ],
          },
        ],
      },
    },
  });

  // Store LogDestination ARN in output so that subsequent phases can access the output
  new CfnLogDestinationOutput(scope, `CloudWatchCentralLoggingOutput`, {
    destinationArn: logDestination.attrArn,
    destinationName: logDestination.destinationName,
    destinationKey: 'CwlCentralLogDestination',
  });
}
