import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { getAccountId, loadAccounts, Account } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { LogArchiveBucket } from '../common/log-archive-bucket';
import * as lambda from '@aws-cdk/aws-lambda';
import { pascalCase } from 'pascal-case';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { AccountStacks } from '../common/account-stacks';
import * as firewall from '../deployments/firewall/cluster';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import * as path from 'path';
import { JsonOutputValue } from '../common/json-output';
import { SecurityHubStack } from '../common/security-hub';
import { DefaultEbsEncryptionKey } from '../common/default-ebs-encryption-key';
import { AccessAnalyzer } from '../common/access-analyzer';
import { createBucketName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { CertificatesConfig } from '@aws-pbmm/common-lambda/lib/config';
import { SecretsContainer } from '@aws-pbmm/common-cdk/lib/core/secrets-container';

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
  const orgUnits = acceleratorConfig.getOrganizationalUnits();
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

  const getNonMandatoryAccountsPerOu = (ouName: string, mandatoryAccKeys: string[]): Account[] => {
    const accountsPerOu: Account[] = [];
    for (const account of accounts) {
      if (account.ou === ouName && !mandatoryAccKeys.includes(account.key)) {
        accountsPerOu.push(account);
      }
    }
    return accountsPerOu;
  };

  const createDefaultEbsEncryptionKey = async (accountKey: string): Promise<void> => {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    const defaultEbsEncryptionKey = new DefaultEbsEncryptionKey(
      accountStack,
      `Default EBS Encryption Key-${pascalCase(accountKey)}`,
    );

    // save the kms key Id for later reference
    new cdk.CfnOutput(accountStack, outputKeys.OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION, {
      value: defaultEbsEncryptionKey.kmsKeyIdForEbsDefaultEncryption,
    });
  };

  const createAccessAnalyzer = async (accountKey: string): Promise<void> => {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);

    const accessAnalyzer = new AccessAnalyzer(accountStack, `Access Analyzer-${pascalCase(accountKey)}`);
  };

  const createAcmSecret = async (accountKey: string, certsConfig: CertificatesConfig): Promise<void> => {
    const accountId = getAccountId(accounts, accountKey);
    const secretsStack = new SecretsContainer(masterAccountStack, 'Secrets');

    const acmSecret = secretsStack.createSecret(`ACM-${certsConfig.name}`, {
      secretName: `accelerator/${accountKey}/acm/${certsConfig.name}`,
      description: `ARN of ACM certificate - ${certsConfig.name}.`,
      principals: [new iam.AccountPrincipal(accountId)],
    });
  };

  const mandatoryAccountKeys: string[] = [];
  // creating assets for default account settings
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    mandatoryAccountKeys.push(accountKey);
    await createDefaultEbsEncryptionKey(accountKey);

    const certsConfig = accountConfig.certificates;
    if (certsConfig && certsConfig.length > 0) {
      for (const certConfig of certsConfig) {
        await createAcmSecret(accountKey, certConfig);
      }
    }

    if (accountKey === 'security') {
      await createAccessAnalyzer(accountKey);
    }
  }

  // creating assets for org unit accounts
  for (const [orgName, orgConfig] of orgUnits) {
    const orgAccounts = getNonMandatoryAccountsPerOu(orgName, mandatoryAccountKeys);
    for (const orgAccount of orgAccounts) {
      await createDefaultEbsEncryptionKey(orgAccount.key);

      const certsConfig = orgConfig.certificates;
      if (certsConfig && certsConfig.length > 0) {
        for (const certConfig of certsConfig) {
          await createAcmSecret(orgAccount.key, certConfig);
        }
      }
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

  // Firewall creation step 1
  await firewall.step1({
    accountStacks,
    config: acceleratorConfig,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
