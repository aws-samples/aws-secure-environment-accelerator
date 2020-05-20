import * as path from 'path';
import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import { createBucketName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { getAccountId, loadAccounts, Account } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { LogArchiveBucket } from '../common/log-archive-bucket';
import { AccountStacks } from '../common/account-stacks';
import { JsonOutputValue } from '../common/json-output';
import { SecurityHubStack } from '../common/security-hub';
import { AccessAnalyzer } from '../common/access-analyzer';
import * as centralServices from '../deployments/central-services';
import * as defaults from '../deployments/defaults';
import * as firewallCluster from '../deployments/firewall/cluster';
import * as mad from '../deployments/mad';
import * as budget from '../deployments/billing/budget';

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
  const mandatoryAccountConfig = acceleratorConfig.getMandatoryAccountConfigs();
  const logRetentionInDays = globalOptionsConfig['central-log-retention'];
  // TODO Remove hard-coded 'log-archive' account key and use configuration file somehow
  const logArchiveAccountId = getAccountId(accounts, 'log-archive');

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
    bucketNameGeneratorInput: string,
    destinationKeyPrefix?: string,
  ): void => {
    // creating a bucket to store artifacts
    const artifactBucket = new s3.Bucket(masterAccountStack, `${artifactName}ArtifactsBucket${accountKey}`, {
      versioned: true,
      bucketName: createBucketName(bucketNameGeneratorInput),
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

  // upload IAM-Policies Artifacts
  uploadArtifacts('IamPolicy', 'iam-policies', 'iam-policy', 'master', 'iam', 'iam-policy');

  const createAccessAnalyzer = async (accountKey: string): Promise<void> => {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);

    new AccessAnalyzer(accountStack, `Access Analyzer-${pascalCase(accountKey)}`);
  };

  // creating assets for default account settings
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    // TODO Remove hard-coded account key
    if (accountKey === 'security') {
      await createAccessAnalyzer(accountKey);
    }
  }

  for (const [accountKey, accountConfig] of acceleratorConfig.getAccountConfigs()) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }
    const mandatoryAccountId = getAccountId(accounts, accountKey);
    const rdgwBucketName = `pbmmaccel-${mandatoryAccountId}-${cdk.Aws.REGION}`;

    // upload RDGW Artifacts
    uploadArtifacts('Rdgw', 'scripts', 'config/scripts/', accountKey, 'rdgw', 'config/scripts');
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

  // Create defaults, e.g. S3 buckets, EBS encryption keys
  const defaultsResult = await defaults.step1({
    acceleratorName: context.acceleratorName,
    accountStacks,
    config: acceleratorConfig,
  });

  // MAD creation step 1
  // Needs EBS default keys from the EBS default step
  await mad.step1({
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    accountEbsEncryptionKeys: defaultsResult.accountEbsEncryptionKeys,
    accountStacks,
    config: acceleratorConfig,
  });

  // Firewall creation step 1
  await firewallCluster.step1({
    accountStacks,
    config: acceleratorConfig,
  });

  // Budget creation step 1
  await budget.step1({
    accountStacks,
    config: acceleratorConfig,
  });

  // Central Services step 1
  await centralServices.step1({
    accountStacks,
    config: acceleratorConfig,
    accounts,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
