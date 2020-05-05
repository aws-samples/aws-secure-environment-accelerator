import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';
import { pascalCase } from 'pascal-case';
import { AcceleratorStack } from '../common/accelerator-stack';
import { LogArchiveBucket } from '../common/log-archive-bucket';
import { AccountDefaultSettingsAssets } from '../common/account-default-settings-assets';
import { Context } from '../utils/context';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

/**
 * This is the main entry point to deploy phase 0.
 *
 * The following resources are deployed in phase 0:
 *   - Log archive bucket
 *
 * TODO This phase could be merged into phase 1.
 */
async function main() {
  const context = await Context.load();

  // TODO Get these values dynamically
  const globalOptionsConfig = context.config['global-options'];
  const logRetentionInDays = globalOptionsConfig['central-log-retention'];

  const app = new cdk.App();

  const accountStacks: { [accountKey: string]: AcceleratorStack } = {};

  const getAccountStack = (accountKey: string): AcceleratorStack => {
    if (accountStacks[accountKey]) {
      return accountStacks[accountKey];
    }

    const account = context.accounts.getAccountByKey(accountKey);
    const accountPrettyName = pascalCase(accountKey);
    const accountStack = new AcceleratorStack(app, `${accountPrettyName}Phase0`, {
      stackName: `PBMMAccel-${accountPrettyName}-Phase0`,
      context,
      account,
    });
    accountStacks[accountKey] = accountStack;
    return accountStack;
  };

  // Master Stack to update Custom Resource Lambda Functions invoke permissions
  // TODO Remove hard-coded 'master' account key and use configuration file somehow
  const masterAccountStack = getAccountStack('master');
  for (const [index, funcArn] of Object.entries(context.environment.cfnCustomResourceFunctions)) {
    for (const account of context.accounts) {
      new lambda.CfnPermission(masterAccountStack, `${index}${account.key}InvokePermission`, {
        functionName: funcArn,
        action: 'lambda:InvokeFunction',
        principal: `arn:aws:iam::${account.id}:role/${context.environment.acceleratorExecutionRoleName}`,
      });
    }
  }

  // TODO Remove hard-coded 'log-archive' account key and use configuration file somehow
  const logArchiveAccountId = getAccountId(context.accounts, 'log-archive');
  const logArchiveStack = getAccountStack('log-archive');

  // Create the log archive bucket
  const bucket = new LogArchiveBucket(logArchiveStack, 'LogArchive', {
    logRetention: cdk.Duration.days(logRetentionInDays),
  });

  // Grant all accounts access to the log archive bucket
  const principals = context.accounts.map(account => new iam.AccountPrincipal(account.id));
  bucket.grantReplicate(...principals);

  // store the s3 bucket - kms key arn for later reference
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_ACCOUNT_ID, {
    value: logArchiveAccountId,
  });

  // store the s3 bucket arn for later reference
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_ARN, {
    value: bucket.bucketArn,
  });

  // store the s3 bucket - kms key arn for later reference
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN, {
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

  // creating assets for default account settings
  const mandatoryAccountConfig = context.config['mandatory-account-configs'];
  for (const accountKey of Object.keys(mandatoryAccountConfig)) {
    const accountStack = getAccountStack(accountKey);
    const accountDefaults = new AccountDefaultSettingsAssets(accountStack, 'AccountDefaults');

    // save the kms key Id for later reference
    new cdk.CfnOutput(accountStack, outputKeys.OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION, {
      value: accountDefaults.kmsKeyIdForEbsDefaultEncryption,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();
