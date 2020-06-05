import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import * as iam from '@aws-cdk/aws-iam';
import { createRoleName, createBucketName, createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as s3 from '@aws-cdk/aws-s3';
import * as logs from '@aws-cdk/aws-logs';
import * as kinesisfirehose from '@aws-cdk/aws-kinesisfirehose';
import { AccountStacks } from '../../../common/account-stacks';
import { Account } from '../../../utils/accounts';
import { JsonOutputValue } from '../../../common/json-output';

export interface CentralLoggingToS3Step1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
}

/**
 * Enable Central Logging to S3 in "log-archive" account Step 1
 */
export async function step1(props: CentralLoggingToS3Step1Props) {
  const { accountStacks, config, accounts } = props;

  const globalOptions = config['global-options'];

  if (globalOptions) {
    // Setup for CloudWatch logs storing in logs account
    const logConfig = globalOptions['central-log-services'];
    const logsAccount = accounts.find(account => account.type === 'log-archive');
    if (!logsAccount) {
      throw new Error('Landing Zone "log-archive" Account Not found');
    }
    const allAccountIds = accounts.map(account => account.id);
    const logsAccountStack = accountStacks.getOrCreateAccountStack(logsAccount.key);
    await cwlSettingsInLogArchive({
      scope: logsAccountStack,
      accountIds: allAccountIds,
    });
  }
}

/**
 * Create initial Setup in Log Archive Account for centralized logging for sub accounts in single S3 bucket
 * 5.15b - READY - Centralize CWL - Part 2
 */
async function cwlSettingsInLogArchive(props: { scope: cdk.Construct; accountIds: string[] }) {
  const { scope, accountIds } = props;
  // Creating Central Log Bucket
  const logsBucket = new s3.Bucket(scope, `CWL-Centralized-logging-Bucket`, {
    bucketName: createBucketName('cwl-logs'),
  });

  // Create Kinesis Stream for Logs streaming
  const logsStream = new kinesis.Stream(scope, 'Logs-Stream', {
    streamName: createName({
      name: 'Logs-Stream',
      suffixLength: 0,
    }),
    encryption: kinesis.StreamEncryption.UNENCRYPTED,
  });

  // Create IAM Role for reading logs from stream and push to destination
  const logsRole = new iam.Role(scope, 'CWL-Logs-Stream-Role', {
    roleName: createRoleName('CWL-Stream-Role'),
    assumedBy: new iam.ServicePrincipal('logs.amazonaws.com'),
    path: '/service-role/',
  });

  // Create IAM Policy for reading logs from stream and push to destination
  const logsRolePolicy = new iam.Policy(scope, 'CWL-Logs-Stream-Policy', {
    roles: [logsRole],
    statements: [
      new iam.PolicyStatement({
        resources: [logsStream.streamArn],
        actions: ['kinesis:PutRecord'],
      }),
      new iam.PolicyStatement({
        resources: [logsRole.roleArn],
        actions: ['iam:PassRole'],
      }),
    ],
  });

  const destinationName = createName({
    name: 'LogDestination',
    suffixLength: 0,
  });
  const accountIdsStr = `"${accountIds.join('","')}"`;
  const destinationPolicyStr = `{
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Effect" : "Allow",
        "Principal" : {
          "AWS" : [${accountIdsStr}]
        },
        "Action" : "logs:PutSubscriptionFilter",
        "Resource" : "arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:destination:${destinationName}"
      }
    ]
  }`;
  // Create AWS Logs Destination
  const logDestination = new logs.CfnDestination(scope, 'Log-Destination', {
    destinationName,
    targetArn: logsStream.streamArn,
    roleArn: logsRole.roleArn,
    destinationPolicy: destinationPolicyStr,
  });
  logDestination.node.addDependency(logsRolePolicy);

  // Creating IAM role for Kinesis Delivery Stream Role
  const kinesisStreamRole = new iam.Role(scope, 'CWL-Kinesis-Stream-Role', {
    roleName: createRoleName('Kinesis-Stream-Role'),
    assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
  });

  const kinesisStreamPolicy = new iam.Policy(scope, 'CWL-Kinesis-Stream-Policy', {
    roles: [kinesisStreamRole],
    statements: [
      new iam.PolicyStatement({
        resources: [logsBucket.bucketArn, `${logsBucket.bucketArn}*`],
        actions: [
          's3:AbortMultipartUpload',
          's3:GetBucketLocation',
          's3:GetObject',
          's3:ListBucket',
          's3:ListBucketMultipartUploads',
          's3:PutObject',
        ],
      }),
      new iam.PolicyStatement({
        resources: ['*'],
        actions: [
          'kinesis:DescribeStream',
          'kinesis:GetShardIterator',
          'kinesis:GetRecords',
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
    deliveryStreamType: 'KinesisStreamAsSource',
    kinesisStreamSourceConfiguration: {
      kinesisStreamArn: logsStream.streamArn,
      roleArn: kinesisStreamRole.roleArn,
    },
    extendedS3DestinationConfiguration: {
      bucketArn: logsBucket.bucketArn,
      bufferingHints: {
        intervalInSeconds: 60,
        sizeInMBs: 50,
      },
      compressionFormat: 'UNCOMPRESSED',
      roleArn: kinesisStreamRole.roleArn,
    },
  });
  kinesisDeliveryStream.node.addDependency(kinesisStreamPolicy);
  kinesisDeliveryStream.node.addDependency(logsRolePolicy);
  
  // Store LogDestination ARN in output so that subsequent phases can access the output
  new JsonOutputValue(scope, `CloudWatchCentralLoggingOutput`, {
    type: 'CloudWatchCentralLogging',
    value: {
      logDestination: logDestination.attrArn
    },
  });
}
