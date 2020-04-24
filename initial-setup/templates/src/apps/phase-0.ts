import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { LogArchiveBucket } from '../common/log-archive-bucket';
import * as lambda from '@aws-cdk/aws-lambda';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

export const OUTPUT_LOG_ARCHIVE_ACCOUNT_ID = 'LogArchiveAccountId';
export const OUTPUT_LOG_ARCHIVE_BUCKET_ARN = 'LogArchiveBucketArn';
export const OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN = 'LogArchiveEncryptionKey';

/**
 * This is the main entry point to deploy phase 0.
 *
 * The following resources are deployed in phase 0:
 *   - Log archive bucket
 *
 * TODO This phase could be merged into phase 1.
 */
async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();

  // TODO Get these values dynamically
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const logRetentionInDays = globalOptionsConfig['central-log-retention'];
  const logArchiveAccountId = getAccountId(accounts, 'log-archive');
  const masterAccountId = getAccountId(accounts, 'master');

  const app = new cdk.App();

  // Master Stack to update Custom Resource Lambda Functions invoke permissions
  const masterStack = new AcceleratorStack(app, 'MasterStackForCustomResources', {
    env: {
      account: masterAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-CfnCustomResource-Permissions',
  });

  for (const [index, func] of context.customResourceFunctions.entries()) {
    for (const account of accounts) {
      new lambda.CfnPermission(masterStack, `${func.functionName}${account.key}InvokePermission`, {
        functionName: func.functionName,
        action: 'lambda:InvokeFunction',
        principal: `arn:aws:iam::${getAccountId(accounts, account.key)}:role/${context.acceleratorExecutionRoleName}`,
      });
    }
  }

  const stack = new AcceleratorStack(app, 'LogArchive', {
    env: {
      account: logArchiveAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-LogArchive',
  });

  // Create the log archive bucket
  const bucket = new LogArchiveBucket(stack, 'LogArchive', {
    logRetention: cdk.Duration.days(logRetentionInDays),
  });

  // Grant all accounts access to the log archive bucket
  const principals = accounts.map(account => new iam.AccountPrincipal(account.id));
  bucket.grantReplicate(...principals);

  // store the s3 bucket - kms key arn for later reference
  new cdk.CfnOutput(stack, OUTPUT_LOG_ARCHIVE_ACCOUNT_ID, {
    value: logArchiveAccountId,
  });

  // store the s3 bucket arn for later reference
  new cdk.CfnOutput(stack, OUTPUT_LOG_ARCHIVE_BUCKET_ARN, {
    value: bucket.bucketArn,
  });

  // store the s3 bucket - kms key arn for later reference
  new cdk.CfnOutput(stack, OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN, {
    value: bucket.encryptionKeyArn,
  });

  // TODO Replace above outputs with JSON output
  // new JsonOutputValue(stack, 'LogArchiveOutput', {
  //   type: 'LogArchiveOutput',
  //   value: {
  //     bucketArn: bucket.bucketArn,
  //     encryptionKeyArn: bucket.encryptionKeyArn,
  //   },
  // });
}

// tslint:disable-next-line: no-floating-promises
main();
