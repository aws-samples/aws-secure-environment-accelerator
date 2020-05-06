import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { getAccountId, loadAccounts, Account } from '../utils/accounts';
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
import { IamUserConfigType, IamConfig } from '@aws-pbmm/common-lambda/lib/config';

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

  const app = new cdk.App();

  const accountStacks: { [accountKey: string]: AcceleratorStack } = {};

  const getAccountStack = (accountKey: string): AcceleratorStack => {
    if (accountStacks[accountKey]) {
      return accountStacks[accountKey];
    }

    const accountPrettyName = pascalCase(accountKey);
    const accountStack = new AcceleratorStack(app, `${accountPrettyName}Phase0`, {
      env: {
        account: getAccountId(accounts, accountKey),
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-${accountPrettyName}-Phase0`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
    });
    accountStacks[accountKey] = accountStack;
    return accountStack;
  };

  // Master Stack to update Custom Resource Lambda Functions invoke permissions
  // TODO Remove hard-coded 'master' account key and use configuration file somehow
  const masterAccountStack = getAccountStack('master');
  for (const [index, funcArn] of Object.entries(context.cfnCustomResourceFunctions)) {
    for (const account of accounts) {
      new lambda.CfnPermission(masterAccountStack, `${index}${account.key}InvokePermission`, {
        functionName: funcArn,
        action: 'lambda:InvokeFunction',
        principal: `arn:aws:iam::${account.id}:role/${context.acceleratorExecutionRoleName}`,
      });
    }
  }

  // TODO Remove hard-coded 'log-archive' account key and use configuration file somehow
  const logArchiveAccountId = getAccountId(accounts, 'log-archive');
  const logArchiveStack = getAccountStack('log-archive');

  const accountIds: string[] = accounts.map(account => account.id);

  // Create the log archive bucket
  const bucket = new LogArchiveBucket(logArchiveStack, 'LogArchive', {
    logRetention: cdk.Duration.days(logRetentionInDays),
    logArchiveAccountId,
    accountIds,
  });

  // Grant all accounts access to the log archive bucket
  const principals = accounts.map(account => new iam.AccountPrincipal(account.id));
  bucket.grantReplicate(...principals);

  // store the log archive account Id for later reference
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

  // store the s3 bucket - kms key id for later reference
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ID, {
    value: bucket.encryptionKey.keyId,
  });

  // TODO Replace above outputs with JSON output
  // new JsonOutputValue(stack, 'LogArchiveOutput', {
  //   type: 'LogArchiveOutput',
  //   value: {
  //     bucketArn: bucket.bucketArn,
  //     encryptionKeyArn: bucket.encryptionKeyArn,
  //   },
  // });

  const createAccountDefaultAssets = async (accountKey: string, iamConfig?: IamConfig): Promise<void> => {
    const accountId = getAccountId(accounts, accountKey);
    const accountStack = getAccountStack(accountKey);
    const userPasswords: { [userId: string]: Secret } = {};

    const iamUsers = iamConfig?.users;
    if (iamUsers && iamUsers?.length >= 1) {
      for (const iamUser of iamUsers) {
        if (!IamUserConfigType.is(iamUser)) {
          console.log(
            `IAM config - users is not defined for account with key - ${accountKey}. Skipping Passwords creation.`,
          );
        } else {
          for (const userId of iamUser['user-ids']) {
            const secretsStack = new SecretsStack(accountStack, `Secrets-${userId}-UserPassword`);
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

    const accountDefaultsSettingsAssets = new AccountDefaultSettingsAssets(
      accountStack,
      `Account Default Settings Assets-${pascalCase(accountKey)}`,
      {
        accountId,
        accountKey,
        iamConfig,
        accounts,
        userPasswords,
      },
    );

    // save the kms key Id for later reference
    new cdk.CfnOutput(accountStack, outputKeys.OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION, {
      value: accountDefaultsSettingsAssets.kmsKeyIdForEbsDefaultEncryption,
    });
  };

  const getNonMandatoryAccountsPerOu = (ouName: string, mandatoryAccKeys: string[]): Account[] => {
    const accountsPerOu: Account[] = [];
    for (const account of accounts) {
      if (account.ou === ouName && !mandatoryAccKeys.includes(account.key)) {
        accountsPerOu.push(account);
      }
    }
    return accountsPerOu;
  };

  const mandatoryAccountKeys: string[] = [];
  // creating assets for default account settings
  const mandatoryAccountConfig = acceleratorConfig.getMandatoryAccountConfigs();
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    console.log('181:accountKey: ' + accountKey);
    mandatoryAccountKeys.push(accountKey);
    await createAccountDefaultAssets(accountKey, accountConfig.iam);
  }

  // creating assets for org unit accounts
  const orgUnits = acceleratorConfig.getOrganizationalUnits();
  for (const [orgName, orgConfig] of orgUnits) {
    const orgAccounts = getNonMandatoryAccountsPerOu(orgName, mandatoryAccountKeys);
    console.log(`org accounts for key - ${orgName}: `, orgAccounts);
    for (const orgAccount of orgAccounts) {
      await createAccountDefaultAssets(orgAccount.key, orgConfig.iam);
    }
  }
}

// tslint:disable-next-line: no-floating-promises
main();
