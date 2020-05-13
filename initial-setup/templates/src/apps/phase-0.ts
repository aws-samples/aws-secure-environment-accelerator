import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { getAccountId, loadAccounts, Account } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { LogArchiveBucket } from '../common/log-archive-bucket';
import * as lambda from '@aws-cdk/aws-lambda';
import { pascalCase } from 'pascal-case';
import { AccountDefaultSettingsAssets } from '../common/account-default-settings-assets';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { SecretsContainer } from '@aws-pbmm/common-cdk/lib/core/secrets-container';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import { IamUserConfigType, IamConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../common/account-stacks';
import * as firewall from '../deployments/firewall/cluster';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import * as path from 'path';
import { JsonOutputValue } from '../common/json-output';
import { SecurityHubStack } from '../common/security-hub';
import { createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

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
  const outputs = await loadStackOutputs();

  // TODO Get these values dynamically
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const logRetentionInDays = globalOptionsConfig['central-log-retention'];
  // TODO Remove hard-coded 'log-archive' account key and use configuration file somehow
  const logArchiveAccountId = getAccountId(accounts, 'log-archive');
  const logArchiveS3BucketArn = getStackOutput(outputs, 'log-archive', outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_ARN);
  const logArchiveS3KmsKeyArn = getStackOutput(
    outputs,
    'log-archive',
    outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN,
  );

  const app = new cdk.App();

  const accountStacks = new AccountStacks(app, {
    phase: 0,
    accounts,
    context,
  });

  // Master Stack to update Custom Resource Lambda Functions invoke permissions
  // TODO Remove hard-coded 'master' account key and use configuration file somehow
  const masterAccountStack = accountStacks.getOrCreateAccountStack('master');
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
  const logArchiveStack = accountStacks.getOrCreateAccountStack('log-archive');

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

  // Create a secrets container in the master account
  // Only the master account can contain secrets
  const secretsContainer = new SecretsContainer(masterAccountStack, 'Secrets');

  const createAccountDefaultAssets = async (accountKey: string, iamConfig?: IamConfig): Promise<void> => {
    const accountId = getAccountId(accounts, accountKey);
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
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
            const password = secretsContainer.createSecret(`${userId}-UserPassword`, {
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

    const costAndUsageReportConfig = globalOptionsConfig.reports['cost-and-usage-report'];
    const s3BucketNameForCur = costAndUsageReportConfig['s3-bucket']
      .replace('xxaccountIdxx', accountId)
      .replace('xxregionxx', costAndUsageReportConfig['s3-region']);

    const accountDefaultsSettingsAssets = new AccountDefaultSettingsAssets(
      accountStack,
      `Account Default Settings Assets-${pascalCase(accountKey)}`,
      {
        accountId,
        accountKey,
        iamConfig,
        accounts,
        userPasswords,
        s3BucketNameForCur,
        expirationInDays: globalOptionsConfig['central-log-retention'],
        replication: {
          accountId: logArchiveAccountId,
          bucketArn: logArchiveS3BucketArn,
          kmsKeyArn: logArchiveS3KmsKeyArn,
        },
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
    mandatoryAccountKeys.push(accountKey);
    await createAccountDefaultAssets(accountKey, accountConfig.iam);
    console.log(`Default assets created for account - ${accountKey}`);
  }

  // creating assets for org unit accounts
  const orgUnits = acceleratorConfig.getOrganizationalUnits();
  for (const [orgName, orgConfig] of orgUnits) {
    const orgAccounts = getNonMandatoryAccountsPerOu(orgName, mandatoryAccountKeys);
    for (const orgAccount of orgAccounts) {
      await createAccountDefaultAssets(orgAccount.key, orgConfig.iam);
      console.log(`Default assets created for account - ${orgAccount.key}`);
    }
  }

  for (const [accountKey, accountConfig] of acceleratorConfig.getAccountConfigs()) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }

    // creating a bucket to store RDGW Host power shell scripts
    const rdgwBucket = new s3.Bucket(masterAccountStack, `RdgwArtifactsBucket${accountKey}`, {
      bucketName: createName('rdgw', { lowercase: true }),
      versioned: true,
    });

    // Granting read access to all the accounts
    principals.map(principal => rdgwBucket.grantRead(principal));

    const artifactsFolderPath = path.join(__dirname, '..', '..', '..', '..', 'reference-artifacts', 'scripts');

    const artifactsDestination = 'config/scripts';

    new s3deployment.BucketDeployment(masterAccountStack, `RdgwArtifactsDeployment${accountKey}`, {
      sources: [s3deployment.Source.asset(artifactsFolderPath)],
      destinationBucket: rdgwBucket,
      destinationKeyPrefix: `${artifactsDestination}/`,
    });

    // outputs to store RDGW reference artifacts scripts s3 bucket information
    new JsonOutputValue(masterAccountStack, `RdgwArtifactsOutput${accountKey}`, {
      type: 'RdgwArtifactsOutput',
      value: {
        accountKey,
        bucketArn: rdgwBucket.bucketArn,
        bucketName: rdgwBucket.bucketName,
        keyPrefix: artifactsDestination,
      },
    });
  }

  const globalOptions = acceleratorConfig['global-options'];
  const securityMasterAccount = accounts.find(a => a.type === 'security' && a.ou === 'core');
  const subAccountIds = accounts.map(account => {
    return {
      AccountId: account.id,
      Email: account.email,
    };
  });
  const securityMasterAccountStack = accountStacks.getOrCreateAccountStack(securityMasterAccount?.key!);
  // Create Security Hub stack for Master Account in Security Account
  const securityHubMaster = new SecurityHubStack(securityMasterAccountStack, `SecurityHubMasterAccountSetup`, {
    account: securityMasterAccount!,
    acceptInvitationFuncArn: context.cfnCustomResourceFunctions.acceptInviteSecurityHubFunctionArn,
    enableStandardsFuncArn: context.cfnCustomResourceFunctions.enableSecurityHubFunctionArn,
    inviteMembersFuncArn: context.cfnCustomResourceFunctions.inviteMembersSecurityHubFunctionArn,
    standards: globalOptions['security-hub-frameworks'],
    subAccountIds,
  });

  // Firewall creation step 1
  await firewall.step1({
    accountStacks,
    config: acceleratorConfig,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
