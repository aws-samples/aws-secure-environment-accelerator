import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as accessanalyzer from '@aws-cdk/aws-accessanalyzer';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import { createName, createLogGroupName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { JsonOutputValue } from '../common/json-output';
import { SecurityHubStack } from '../common/security-hub';
import * as budget from '../deployments/billing/budget';
import * as centralServices from '../deployments/central-services';
import * as defaults from '../deployments/defaults';
import * as firewallCluster from '../deployments/firewall/cluster';
import * as mad from '../deployments/mad';
import { PhaseInput } from './shared';
import * as logs from '@aws-cdk/aws-logs';
import { LogResourcePolicy } from '@custom-resources/logs-resource-policy';
import * as iam from '@aws-cdk/aws-iam';
import { DNS_LOGGING_LOG_GROUP_REGION } from '../utils/constants';
/**
 * This is the main entry point to deploy phase 0.
 *
 * The following resources are deployed in phase 0:
 *   - Log archive bucket
 *   - Copy of the central bucket
 */
export async function deploy({ acceleratorConfig, accountStacks, accounts, context }: PhaseInput) {
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
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

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
    accountKey: masterAccountKey,
    destinationKeyPrefix: 'iam-policy',
  });

  // upload RDGW Artifacts
  uploadArtifacts({
    artifactName: 'Rdgw',
    artifactFolderName: 'scripts',
    artifactKeyPrefix: 'config/scripts/',
    accountKey: masterAccountKey,
    destinationKeyPrefix: 'config/scripts',
  });

  const securityAccountKey = acceleratorConfig.getMandatoryAccountKey('central-security');
  const securityStack = accountStacks.tryGetOrCreateAccountStack(securityAccountKey);
  if (!securityStack) {
    console.warn(`Cannot find security stack`);
  } else {
    new accessanalyzer.CfnAnalyzer(securityStack, 'OrgAccessAnalyzer', {
      analyzerName: createName({
        name: 'AccessAnalyzer',
        account: false,
        region: false,
      }),
      type: 'ORGANIZATION',
    });
  }

  const globalOptions = acceleratorConfig['global-options'];
  const securityMasterAccount = accounts.find(
    a => a.key === acceleratorConfig.getMandatoryAccountKey('central-security'),
  );
  const subAccountIds = accounts.map(account => {
    return {
      AccountId: account.id,
      Email: account.email,
    };
  });

  const securityMasterAccountStack = accountStacks.tryGetOrCreateAccountStack(securityMasterAccount?.key!);
  if (!securityMasterAccountStack) {
    console.warn(`Cannot find security stack`);
  } else {
    // Create Security Hub stack for Master Account in Security Account
    new SecurityHubStack(securityMasterAccountStack, `SecurityHubMasterAccountSetup`, {
      account: securityMasterAccount!,
      standards: globalOptions['security-hub-frameworks'],
      subAccountIds,
    });
  }

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

  /**
   * Code to create LogGroups required for DNS Logging
   */
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccountKey = zonesConfig.account;

  const zonesStack = accountStacks.getOrCreateAccountStack(zonesAccountKey, DNS_LOGGING_LOG_GROUP_REGION);
  for (const phz of zonesConfig.names.public) {
    new logs.LogGroup(zonesStack, `Route53HostedZone-LogGroup`, {
      logGroupName: createLogGroupName(phz, 'r53'),
    });
  }
  // Allow r53 services to write to the log group
  new LogResourcePolicy(zonesStack, 'R53LogGroupPolicy', {
    policyName: 'R53LogGroupPolicy',
    policyStatements: [
      new iam.PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        principals: [new iam.ServicePrincipal('route53.amazonaws.com')],
        resources: [`arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${createLogGroupName('r53')}/*`],
      }),
    ],
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
