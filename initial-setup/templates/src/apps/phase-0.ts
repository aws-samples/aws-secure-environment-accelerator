import * as path from 'path';
import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import { createBucketName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { AccountStacks } from '../common/account-stacks';
import { JsonOutputValue } from '../common/json-output';
import { SecurityHubStack } from '../common/security-hub';
import { AccessAnalyzer } from '../common/access-analyzer';
import * as budget from '../deployments/billing/budget';
import * as centralServices from '../deployments/central-services';
import * as defaults from '../deployments/defaults';
import * as firewallCluster from '../deployments/firewall/cluster';
import * as mad from '../deployments/mad';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

/**
 * This is the main entry point to deploy phase 0.
 *
 * The following resources are deployed in phase 0:
 *   - Log archive bucket
 *   - Copy of the central bucket
 */
async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();

  const app = new cdk.App();

  const accountStacks = new AccountStacks(app, {
    phase: 0,
    accounts,
    context,
  });

  // Create defaults, e.g. S3 buckets, EBS encryption keys
  const defaultsResult = await defaults.step1({
    acceleratorPrefix: context.acceleratorPrefix,
    acceleratorName: context.acceleratorName,
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  const centralBucket = defaultsResult.centralBucketCopy;

  // Master Stack to update Custom Resource Lambda Functions invoke permissions
  // TODO Remove hard-coded 'master' account key and use configuration file somehow
  const masterAccountStack = accountStacks.getOrCreateAccountStack('master');

  const uploadArtifacts = ({
    artifactName,
    artifactFolderName,
    artifactKeyPrefix,
    accountKey,
    destinationKeyPrefix,
  }: {
    artifactName: string;
    artifactFolderName: string;
    artifactKeyPrefix: string;
    accountKey: string;
    destinationKeyPrefix?: string;
  }): void => {
    const artifactsFolderPath = path.join(__dirname, '..', '..', '..', '..', 'reference-artifacts', artifactFolderName);

    new s3deployment.BucketDeployment(masterAccountStack, `${artifactName}ArtifactsDeployment${accountKey}`, {
      sources: [s3deployment.Source.asset(artifactsFolderPath)],
      destinationBucket: centralBucket,
      destinationKeyPrefix,
    });

    // outputs to store reference artifacts s3 bucket information
    new JsonOutputValue(masterAccountStack, `${artifactName}ArtifactsOutput${accountKey}`, {
      type: `${artifactName}ArtifactsOutput`,
      value: {
        accountKey,
        bucketArn: centralBucket.bucketArn,
        bucketName: centralBucket.bucketName,
        keyPrefix: artifactKeyPrefix,
      },
    });
  };

  // upload IAM-Policies Artifacts
  uploadArtifacts({
    artifactName: 'IamPolicy',
    artifactFolderName: 'iam-policies',
    artifactKeyPrefix: 'iam-policy',
    accountKey: 'master',
    destinationKeyPrefix: 'iam-policy',
  });

  // upload RDGW Artifacts
  uploadArtifacts({
    artifactName: 'Rdgw',
    artifactFolderName: 'scripts',
    artifactKeyPrefix: 'config/scripts/',
    accountKey: 'master',
    destinationKeyPrefix: 'config/scripts',
  });

  // creating assets for default account settings
  const mandatoryAccountConfig = acceleratorConfig.getMandatoryAccountConfigs();
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    // TODO Remove hard-coded account key
    if (accountKey === 'security') {
      const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
      new AccessAnalyzer(accountStack, `Access Analyzer-${pascalCase(accountKey)}`);
    }
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
  new SecurityHubStack(securityMasterAccountStack, `SecurityHubMasterAccountSetup`, {
    account: securityMasterAccount!,
    standards: globalOptionsConfig['security-hub-frameworks'],
    subAccountIds,
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

  // TODO Deprecate these outputs
  const logArchiveAccountKey = acceleratorConfig['global-options']['central-log-services'].account;
  const logArchiveStack = accountStacks.getOrCreateAccountStack(logArchiveAccountKey);
  const logArchiveBucket = defaultsResult.centralLogBucket;
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_ACCOUNT_ID, {
    value: logArchiveStack.accountId,
  });
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_ARN, {
    value: logArchiveBucket.bucketArn,
  });
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN, {
    value: logArchiveBucket.encryptionKey!.keyArn,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
