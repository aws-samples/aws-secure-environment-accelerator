import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { LogArchiveBucket } from '../common/log-archive-bucket';
import * as lambda from '@aws-cdk/aws-lambda';
import { pascalCase } from 'pascal-case';
import { AccountDefaultSettingsAssets } from '../common/account-default-settings-assets';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { SecretsStack } from '@aws-pbmm/common-cdk/lib/core/secrets-stack';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import { IamUserConfigType, AccountConfig } from '@aws-pbmm/common-lambda/lib/config';

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

  for (const [index, funcArn] of Object.entries(context.cfnCustomResourceFunctions)) {
    for (const account of accounts) {
      new lambda.CfnPermission(masterStack, `${index}${account.key}InvokePermission`, {
        functionName: funcArn,
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
  new cdk.CfnOutput(stack, outputKeys.OUTPUT_LOG_ARCHIVE_ACCOUNT_ID, {
    value: logArchiveAccountId,
  });

  // store the s3 bucket arn for later reference
  new cdk.CfnOutput(stack, outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_ARN, {
    value: bucket.bucketArn,
  });

  // store the s3 bucket - kms key arn for later reference
  new cdk.CfnOutput(stack, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN, {
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

  const secretsStack = new SecretsStack(app, 'Secrets', {
    env: {
      account: getAccountId(accounts, 'master'),
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-Secrets-IAMUserPasswords',
  });

  // creating assets for default account settings
  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
    const accountId = getAccountId(accounts, accountKey);

    const AccountDefaultsStack = new AcceleratorStack(
      app,
      `PBMMAccel-AccountDefaultSettingsAssets-${accountKey}Stack`,
      {
        env: {
          account: accountId,
          region: cdk.Aws.REGION,
        },
        acceleratorName: context.acceleratorName,
        acceleratorPrefix: context.acceleratorPrefix,
        stackName: `PBMMAccel-AccountDefaultSettingsAssets-${pascalCase(accountKey)}Stack`,
      },
    );

    const userPasswords: { [userId: string]: Secret } = {};

    const iamUsers = accountConfig.iam?.users;
    if (iamUsers && iamUsers?.length >= 1) {
      for (const iamUser of iamUsers) {
        if (!IamUserConfigType.is(iamUser)) {
          console.log(
            `IAM config - users is not defined for account with key - ${accountKey}. Skipping Passwords creation.`,
          );
        } else {
          for (const userId of iamUser['user-ids']) {
            const password = secretsStack.createSecret(`${userId}-UserPassword`, {
              secretName: `accelerator/${accountKey}/user/password/${userId}`,
              description: `Password for IAM User - ${userId}.`,
              generateSecretString: {
                passwordLength: 16,
              },
              principals: [new iam.AccountPrincipal(accountId)],
            });
            userPasswords[userId] = password;
          }
        }
      }
    }

    const accountDefaultSettingsAssets = new AccountDefaultSettingsAssets(
      AccountDefaultsStack,
      `Account Default Settings Assets-${pascalCase(accountKey)}`,
      {
        accountId,
        accountKey,
        accountConfig,
        acceleratorConfig,
        accounts,
        userPasswords,
      },
    );

    // save the kms key Id for later reference
    new cdk.CfnOutput(AccountDefaultsStack, outputKeys.OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION, {
      value: accountDefaultSettingsAssets.kmsKeyIdForEbsDefaultEncryption,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();
