import * as cdk from '@aws-cdk/core';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as s3 from '@aws-cdk/aws-s3';
import * as logs from '@aws-cdk/aws-logs';
import * as kinesisfirehose from '@aws-cdk/aws-kinesisfirehose';
import { AccountStacks } from '../../../common/account-stacks';
import { Account } from '../../../utils/accounts';
import { JsonOutputValue } from '../../../common/json-output';
import { CLOUD_WATCH_CENTRAL_LOGGING_BUCKET_PREFIX } from '@aws-accelerator/common/src/util/constants';
import * as c from '@aws-accelerator/common-config';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { CfnLogDestinationOutput } from './outputs';

export interface CentralLoggingToS3Step1Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  logBucket: s3.IBucket;
  outputs: StackOutput[];
  config: c.AcceleratorConfig;
}

/**
 * Enable Central Logging to S3 in "log-archive" account Step 1
 */
export async function step1(props: CentralLoggingToS3Step1Props) {
  const { accountStacks, accounts, logBucket, config, outputs } = props;
  // Setup for CloudWatch logs storing in logs account
  const allAccountIds = accounts.map(account => account.id);
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
      accountIds: allAccountIds,
      bucketArn: logBucket.bucketArn,
      shardCount: regionConfig['kinesis-stream-shard-count'],
      logStreamRoleArn: cwlLogStreamRoleOutput.roleArn,
      kinesisStreamRoleArn: cwlKinesisStreamRoleOutput.roleArn,
    });
  }
}

/**
 * Create initial Setup in Log Archive Account for centralized logging for sub accounts in single S3 bucket
 * 5.15b - READY - Centralize CWL - Part 2
 */
async function cwlSettingsInLogArchive(props: {
  scope: cdk.Construct;
  accountIds: string[];
  bucketArn: string;
  logStreamRoleArn: string;
  kinesisStreamRoleArn: string;
  shardCount?: number;
}) {
  const { scope, accountIds, bucketArn, logStreamRoleArn, kinesisStreamRoleArn, shardCount } = props;

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

  const destinatinPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          AWS: accountIds,
        },
        Action: 'logs:PutSubscriptionFilter',
        Resource: `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:destination:${destinationName}`,
      },
    ],
  };
  const destinationPolicyStr = JSON.stringify(destinatinPolicy);
  // Create AWS Logs Destination
  const logDestination = new logs.CfnDestination(scope, 'Log-Destination', {
    destinationName,
    targetArn: logsStream.streamArn,
    roleArn: logStreamRoleArn,
    destinationPolicy: destinationPolicyStr,
  });

  new kinesisfirehose.CfnDeliveryStream(scope, 'Kinesis-Firehouse-Stream', {
    deliveryStreamName: createName({
      name: 'Kinesis-Delivery-Stream',
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
