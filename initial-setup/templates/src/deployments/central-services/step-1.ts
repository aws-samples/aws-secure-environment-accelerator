import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '../../utils/accounts';
import * as iam from '@aws-cdk/aws-iam';
import { createRoleName, createBucketName, createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as s3 from '@aws-cdk/aws-s3';
import * as logs from '@aws-cdk/aws-logs';
import * as kinesisfirehose from '@aws-cdk/aws-kinesisfirehose';

export interface CentralServicesStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
}

/**
 * Enable Central Services Step 1
 * - Enable Sharing Organization accounts list to monitoring accounts in master account.
 */
export async function step1(props: CentralServicesStep1Props) {
  const { accountStacks, config, accounts } = props;

  const globalOptions = config['global-options'];

  if (globalOptions) {
    await centralServicesSettingsInMaster({
      accountStacks,
      config: globalOptions,
      accounts,
    });
  }
}

/**
 * Central Services Settings in Master Account
 */
async function centralServicesSettingsInMaster(props: {
  accountStacks: AccountStacks;
  config: c.GlobalOptionsConfig;
  accounts: Account[];
}) {
  const { accountStacks, config, accounts } = props;

  const accountIds: string[] = [];
  if (config['central-security-services'] && config['central-security-services'].cwl) {
    accountIds.push(getAccountId(accounts, config['central-security-services'].account));
  }
  if (config['central-operations-services'] && config['central-operations-services'].cwl) {
    accountIds.push(getAccountId(accounts, config['central-operations-services'].account));
  }
  if (config['central-log-services'] && config['central-log-services'].cwl) {
    accountIds.push(getAccountId(accounts, config['central-log-services'].account));
  }

  // Enable Cross-Account CloudWatch access in Master account fot sub accounts
  const masterAccount = accounts.find(account => account.type === 'primary');
  if (!masterAccount) {
    throw new Error('Landing Zone Master Account Not found');
  }
  const accountStack = accountStacks.getOrCreateAccountStack(masterAccount.key);
  await cloudWatchSettingsInMaster({
    scope: accountStack,
    accountIds,
  });

  // Setup for CloudWatch logs storing in logs account
  const logConfig = config['central-log-services'];
  const logsAccount = accounts.find(account => account.type === 'log-archive');
  if (!logsAccount) {
    throw new Error('Landing Zone "log-archive" Account Not found');
  }
  const allAccountIds = accounts.map(account =>account.id);
  const logsAccountStack = accountStacks.getOrCreateAccountStack(logsAccount.key);
  await cwlSettingsInLogArchive({
    scope: logsAccountStack,
    accountIds: allAccountIds
  });
}

/**
 * Cloud Watch Cross Account Settings in Master Account
 * 5.15b - READY - Centralize CWL - Part 1
 */
async function cloudWatchSettingsInMaster(props: { scope: cdk.Construct; accountIds: string[] }) {
  const { scope, accountIds } = props;
  const accountPrincipals: iam.PrincipalBase[] = accountIds.map(accountId => {
    return new iam.AccountPrincipal(accountId);
  });
  const cwlCrossAccountSharingRole = new iam.Role(scope, 'CloudWatch-CrossAccountSharing', {
    roleName: 'CloudWatch-CrossAccountSharing-ListAccountsRole',
    assumedBy: new iam.CompositePrincipal(...accountPrincipals),
  });
  cwlCrossAccountSharingRole.addToPolicy(
    new iam.PolicyStatement({
      resources: ['*'],
      actions: ['organizations:ListAccounts', 'organizations:ListAccountsForParent'],
    }),
  );
}

/**
 * Create initial Setup in Log Archive Account for centralized logging for sub accounts in single S3 bucket
 * 5.15b - READY - Centralize CWL - Part 2
 */
async function cwlSettingsInLogArchive(props: { scope: cdk.Construct, accountIds: string[] }) {
  const { scope, accountIds } = props;
  // Creating Central Log Bucket
  const logsBucket = new s3.Bucket(scope, `CWL-Centralized-logging-Bucket`, {
    bucketName: createBucketName('cwl-logs'),
  });

  // Create Kinesis Stream for Logs streaming
  const logsStream = new kinesis.Stream(scope, 'Logs-Stream', {
    streamName: createName({
      name: 'Logs-Stream',
      suffixLength: 0
    }),
    encryption: kinesis.StreamEncryption.UNENCRYPTED
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
        actions: [
          'kinesis:PutRecord'
        ],
      }),
      new iam.PolicyStatement({
        resources: [logsRole.roleArn],
        actions: [
          'iam:PassRole'
        ],
      })
    ]
  });

  const destinationName = createName({
    name:'log-destination',
    suffixLength: 0
  });
  const accountIdsStr = `"${accountIds.join('","')}"`;
  console.log(accountIdsStr);
  const destinationPolicyStr = 
    `{"Version" : "2012-10-17","Statement" : [{"Effect" : "Allow","Principal" : {"AWS" : [${accountIdsStr}]},"Action" : "logs:PutSubscriptionFilter","Resource" : "arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:destination:${destinationName}"}]}`;
iam.AccountPrincipal
  // Create AWS Logs Destination
  const logDestination = new logs.CfnDestination(scope, 'Log-Destination', {
    destinationName: destinationName,
    targetArn: logsStream.streamArn,
    roleArn: logsRole.roleArn,
    destinationPolicy: destinationPolicyStr
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
        resources: ['*'],
        actions: [
          'kinesis:DescribeStream', 
          'kinesis:GetShardIterator', 
          'kinesis:GetRecords', 
          'kms:Decrypt',
          'logs:PutLogEvents',
          'lambda:GetFunctionConfiguration',
          'lambda:InvokeFunction'
        ],
      }),
      new iam.PolicyStatement({
        resources: [logsBucket.bucketArn, `${logsBucket.bucketArn}${cdk.Aws.URL_SUFFIX}*`],
        actions: [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject"
        ],
      })
    ]
  });

  const kinesisDeliveryStream = new kinesisfirehose.CfnDeliveryStream(scope, 'Kinesis-Firehouse-Stream', {
    deliveryStreamName: createName({
      name: 'Kinesis-Delivery-Stream',
    }),
    deliveryStreamType: 'KinesisStreamAsSource',
    kinesisStreamSourceConfiguration: {
      kinesisStreamArn: logsStream.streamArn,
      roleArn: kinesisStreamRole.roleArn
    },
    extendedS3DestinationConfiguration: {
      bucketArn: logsBucket.bucketArn,
      bufferingHints: {
        intervalInSeconds:  60,
        sizeInMBs: 50
      },
      compressionFormat: 'UNCOMPRESSED',
      roleArn: kinesisStreamRole.roleArn,
    }
  });
  kinesisDeliveryStream.node.addDependency(kinesisStreamPolicy);
  kinesisDeliveryStream.node.addDependency(logsRolePolicy);
}
