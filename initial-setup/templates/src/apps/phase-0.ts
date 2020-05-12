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
import { SecretsStack } from '@aws-pbmm/common-cdk/lib/core/secrets-stack';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import { IamUserConfigType, IamConfig, IamConfigType, IamPolicyConfigType } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../common/account-stacks';
import * as firewall from '../deployments/firewall/cluster';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import * as path from 'path';
import { JsonOutputValue } from '../common/json-output';
import { SecurityHubStack } from '../common/security-hub';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';

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
  const mandatoryAccountConfig = acceleratorConfig.getMandatoryAccountConfigs();
  const orgUnits = acceleratorConfig.getOrganizationalUnits();
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

  const uploadArtifacts = (
    artifactName: string,
    artifactFolderName: string,
    artifactKeyPrefix: string,
    accountKey: string,
    artifactBucketName: string,
    destinationKeyPrefix?: string,
  ): void => {
    // creating a bucket to store artifacts
    const artifactBucket = new s3.Bucket(masterAccountStack, `${artifactName}ArtifactsBucket${accountKey}`, {
      versioned: true,
      bucketName: artifactBucketName,
    });

    // Granting read access to all the accounts
    principals.map(principal => artifactBucket.grantRead(principal));

    const artifactsFolderPath = path.join(__dirname, '..', '..', '..', '..', 'reference-artifacts', artifactFolderName);

    new s3deployment.BucketDeployment(masterAccountStack, `${artifactName}ArtifactsDeployment${accountKey}`, {
      sources: [s3deployment.Source.asset(artifactsFolderPath)],
      destinationBucket: artifactBucket,
      destinationKeyPrefix,
    });

    // outputs to store reference artifacts s3 bucket information
    new JsonOutputValue(masterAccountStack, `${artifactName}ArtifactsOutput${accountKey}`, {
      type: `${artifactName}ArtifactsOutput`,
      value: {
        accountKey,
        bucketArn: artifactBucket.bucketArn,
        bucketName: artifactBucket.bucketName,
        keyPrefix: artifactKeyPrefix,
      },
    });
  };

  const masterAccountId = getAccountId(accounts, 'master');
  const sts = new STS();
  const masterAcctCredentials = await sts.getCredentialsForAccountAndRole(
    masterAccountId,
    context.acceleratorExecutionRoleName,
  );
  const iamPolicyS3 = new S3(masterAcctCredentials);

  const iamPoliciesDefinition: { [policyName: string]: string } = {};
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    const iamConfig = accountConfig.iam;
    if (IamConfigType.is(iamConfig)) {
      const iamPolicies = iamConfig?.policies;
      if (iamPolicies && iamPolicies?.length > 1) {
        for (const iamPolicy of iamPolicies) {
          if (IamPolicyConfigType.is(iamPolicy)) {
            const iamPolicyName = iamPolicy['policy-name'];
            const iamPolicyFileName = iamPolicy.policy;
            const policyContent = await iamPolicyS3.getObjectBodyAsString({
              Bucket: 'pbmmaccel-iam-policy-config',
              Key: `iam-policy/${iamPolicyFileName}`,
            });
            iamPoliciesDefinition[iamPolicyName] = policyContent;
          }
        }
      }
    }
  }

  const createAccountDefaultAssets = async (accountKey: string, iamConfig?: IamConfig): Promise<void> => {
    const defaultAssetAccountId = getAccountId(accounts, accountKey);
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
            const secretsStack = new SecretsStack(masterAccountStack, `Secrets-${userId}-UserPassword`);
            const password = secretsStack.createSecret(`${userId}-UserPassword`, {
              secretName: `accelerator/${accountKey}/user/password/${userId}`,
              description: `Password for IAM User - ${userId}.`,
              generateSecretString: {
                passwordLength: 16,
              },
              principals: [new iam.AccountPrincipal(defaultAssetAccountId)],
            });
            userPasswords[userId] = password;
          }
        }
      }
    }

    const costAndUsageReportConfig = globalOptionsConfig.reports['cost-and-usage-report'];
    const s3BucketNameForCur = costAndUsageReportConfig['s3-bucket']
      .replace('xxaccountIdxx', defaultAssetAccountId)
      .replace('xxregionxx', costAndUsageReportConfig['s3-region']);

    const accountDefaultsSettingsAssets = new AccountDefaultSettingsAssets(
      accountStack,
      `Account Default Settings Assets-${pascalCase(accountKey)}`,
      {
        accountId: defaultAssetAccountId,
        accountKey,
        iamConfig,
        iamPoliciesDefinition,
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
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    mandatoryAccountKeys.push(accountKey);
    await createAccountDefaultAssets(accountKey, accountConfig.iam);
    console.log(`Default assets created for account - ${accountKey}`);
  }

  // creating assets for org unit accounts
  for (const [orgName, orgConfig] of orgUnits) {
    const orgAccounts = getNonMandatoryAccountsPerOu(orgName, mandatoryAccountKeys);
    for (const orgAccount of orgAccounts) {
      await createAccountDefaultAssets(orgAccount.key, orgConfig.iam);
      console.log(`Default assets created for account - ${orgAccount.key}`);
    }
  }

  for (const [accountKey, accountConfig] of Object.entries(acceleratorConfig['mandatory-account-configs'])) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }
    const mandatoryAccountId = getAccountId(accounts, accountKey);
    const rdgwBucketName = `pbmmaccel-${mandatoryAccountId}-${cdk.Aws.REGION}`;

    // upload RDGW Artifacts
    uploadArtifacts('Rdgw', 'scripts', 'config/scripts/', accountKey, rdgwBucketName, 'config/scripts');
  }

  const globalOptions = acceleratorConfig['global-options'];
  const securityMasterAccount = accounts.find(a => a.type === 'security' && a.ou === 'core');
  const subAccountIds = accounts.map(account => {
    return {
      AccountId: account.id,
      Email: account.email,
    };
  });
  // const securityMasterAccountStack = accountStacks.getOrCreateAccountStack(securityMasterAccount?.key!);
  // // Create Security Hub stack for Master Account in Security Account
  // const securityHubMaster = new SecurityHubStack(securityMasterAccountStack, `SecurityHubMasterAccountSetup`, {
  //   account: securityMasterAccount!,
  //   acceptInvitationFuncArn: context.cfnCustomResourceFunctions.acceptInviteSecurityHubFunctionArn,
  //   enableStandardsFuncArn: context.cfnCustomResourceFunctions.enableSecurityHubFunctionArn,
  //   inviteMembersFuncArn: context.cfnCustomResourceFunctions.inviteMembersSecurityHubFunctionArn,
  //   standards: globalOptions['security-hub-frameworks'],
  //   subAccountIds,
  // });

  // // Firewall creation step 1
  // await firewall.step1({
  //   accountStacks,
  //   config: acceleratorConfig,
  // });
}

// tslint:disable-next-line: no-floating-promises
main();
